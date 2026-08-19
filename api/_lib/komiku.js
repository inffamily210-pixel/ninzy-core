/**
 * Shared Komiku scraping helpers, used by every function in /api.
 * Same logic as komiku-proxy/server.js (kept there too as a standalone
 * alternative you can deploy separately if you don't want to use Vercel
 * Functions). See the notes at the top of that file for caveats — this
 * is a scraper, not an official API, and selectors may need adjusting
 * if Komiku changes their site.
 */
import * as cheerio from "cheerio";

export const BASE = "https://komiku.org";
// Komiku's listing pages (/pustaka/...) are now just an empty shell — the
// actual card grid is loaded client-side via HTMX from this subdomain
// (see hx-get on the shell page). Fetch this directly instead.
export const LIST_API = "https://api.komiku.org/manga/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Simple in-memory cache. On Vercel this only helps within a warm
// serverless instance (a few minutes between invocations at best) but
// costs nothing and avoids hammering Komiku on bursts of requests.
const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

export async function getHtml(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.html;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "id,en;q=0.8" } });
  if (!res.ok) throw new Error(`Fetch ${url} -> ${res.status}`);
  const html = await res.text();
  cache.set(url, { html, t: Date.now() });
  return html;
}

export function absUrl(u) {
  if (!u) return "";
  try { return new URL(u, BASE).toString(); } catch { return u; }
}

export function slugFromUrl(u) {
  const parts = (u || "").replace(/\/$/, "").split("/");
  return parts[parts.length - 1] || "";
}

/**
 * Parses a grid of manga "cards" from a Komiku listing page. See the
 * longer comment in komiku-proxy/server.js for how the markup looks.
 */
export function parseCards(html) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const items = [];

  // Current markup (served from LIST_API): title/description/chapters live in
  // <div class="kan">, with a <div class="bgei"> holding the cover image. The
  // source HTML leaves .bgei's <div> unclosed, so cheerio actually parses .kan
  // as *nested inside* .bgei rather than as a sibling — handle both just in case.
  $(".kan").each((_, kanEl) => {
    const $kan = $(kanEl);

    const href = absUrl($kan.find('a[href*="/manga/"]').first().attr("href"));
    if (!/\/manga\/[^/]+\/?$/.test(href)) return;
    const id = slugFromUrl(href);
    if (seen.has(id)) return;

    const title = $kan.find("h3").first().text().trim();
    if (!title) return;

    const $bgei = $kan.closest(".bgei").length ? $kan.closest(".bgei") : $kan.prevAll(".bgei").first();
    const img = $bgei.find("img").first();
    const cover = absUrl(img.attr("src") || img.attr("data-src"));

    const chapterSpans = $kan.find(".new1 a").last().find("span");
    const chapterText = (chapterSpans.last().text() || "").trim().replace(/^Chapter\s*/i, "");

    seen.add(id);
    items.push({ id, title, cover, chapter: chapterText || "", type: "komiku" });
  });

  return items;
}

export const KOMIKU_GENRES = [
  { id: "isekai", name: "Isekai" }, { id: "fantasy", name: "Fantasy" },
  { id: "action", name: "Action" }, { id: "romance", name: "Romance" },
  { id: "comedy", name: "Comedy" }, { id: "drama", name: "Drama" },
  { id: "adventure", name: "Adventure" }, { id: "school-life", name: "School Life" },
  { id: "martial-arts", name: "Martial Arts" }, { id: "supernatural", name: "Supernatural" },
  { id: "horror", name: "Horror" }, { id: "mystery", name: "Mystery" },
  { id: "seinen", name: "Seinen" }, { id: "shounen", name: "Shounen" },
  { id: "slice-of-life", name: "Slice of Life" }, { id: "ecchi", name: "Ecchi" }
];

/** Adds permissive CORS headers — call at the top of every handler. */
export function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
    }
