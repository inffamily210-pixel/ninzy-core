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

  $('a[href*="/manga/"]').each((_, el) => {
    const href = absUrl($(el).attr("href"));
    if (!/\/manga\/[^/]+\/?$/.test(href)) return;
    const id = slugFromUrl(href);
    if (seen.has(id)) return;

    let container = $(el);
    for (let i = 0; i < 4 && container.parent().length; i++) container = container.parent();

    const img = $(el).find("img").attr("data-src") || $(el).find("img").attr("src") || container.find("img").first().attr("data-src") || container.find("img").first().attr("src");
    const titleEl = container.find(`a[href="${$(el).attr("href")}"]`).filter((i, e) => $(e).text().trim().length > 0).first();
    const title = (titleEl.text() || $(el).find("img").attr("alt") || "").trim().replace(/^Baca (Manga|Manhwa|Manhua|Komik)\s*/i, "");
    if (!title) return;

    const chapterLink = container.find('a[href*="-chapter-"]').first();
    const chapterText = chapterLink.text().trim().replace(/^Chapter\s*/i, "");

    seen.add(id);
    items.push({ id, title, cover: absUrl(img), chapter: chapterText || "", type: "komiku" });
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
