/**
 * NINZY CORE — Shinigami proxy server (standalone alternative to
 * the Vercel functions in api/shinigami/*.js — same logic, same
 * "bring your own upstream API" approach).
 * ---------------------------------------------------------------
 * READ THIS BEFORE YOU DEPLOY:
 *
 * The Komiku proxy (komiku-proxy/) works by fetching Komiku's HTML
 * pages and parsing them with Cheerio, because Komiku's pages are
 * server-rendered. Shinigami's current site (app.shinigami.asia,
 * and its many predecessor domains — it has changed domains over a
 * dozen times) is a client-rendered single-page app: the raw HTML is
 * an empty shell, and the manga/chapter data is fetched afterwards
 * by JavaScript from Shinigami's own backend API. A Node fetch +
 * Cheerio scraper (like the Komiku one) literally cannot see that
 * content. On top of that, Shinigami sits behind Cloudflare bot
 * protection, so even hitting the right backend endpoint directly
 * can get blocked without a real browser fingerprint.
 *
 * So instead of shipping a scraper that would silently not work,
 * this server is a thin, honest "bring your own upstream JSON API"
 * bridge:
 *   - Set SHINIGAMI_API_BASE to a JSON API that already knows how
 *     to talk to Shinigami. Options people have published (NOT
 *     verified or endorsed by us — read their code before trusting
 *     them with your traffic):
 *       · https://github.com/Sansekai/Unofficial-Shinigami-Api
 *       · https://github.com/AzwarKusumah/ryukoapi-shinigami
 *   - Or point it at your own reverse-engineered endpoint if you've
 *     inspected Shinigami's network requests yourself.
 *   - Or run a headless-browser scraper (Puppeteer/Playwright) that
 *     actually executes the site's JS — out of scope for this
 *     lightweight script, but that's the "do it fully yourself" path.
 *
 * Until SHINIGAMI_API_BASE is set, every route below returns a
 * clear 501 "not configured" error instead of pretending to work.
 * The response shapes below use common field-name guesses and are
 * NOT guaranteed to match whatever upstream you pick — adjust the
 * `pick(...)` field lists and endpoint paths to match it.
 */
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import NodeCache from "node-cache";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8788;
const UPSTREAM = (process.env.SHINIGAMI_API_BASE || "").replace(/\/$/, "");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const cache = new NodeCache({ stdTTL: 300 });

function requireUpstream(res) {
  if (!UPSTREAM) {
    res.status(501).json({
      error: "SHINIGAMI_API_BASE belum diatur.",
      hint: "Set environment variable SHINIGAMI_API_BASE ke URL API JSON upstream. Lihat komentar di bagian atas file ini."
    });
    return false;
  }
  return true;
}

async function getJson(path) {
  const url = `${UPSTREAM}${path}`;
  const cached = cache.get(url);
  if (cached) return cached;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Upstream error ${res.status} (${url})`);
  const json = await res.json();
  cache.set(url, json);
  return json;
}

function pick(obj, ...keys) {
  return keys.map(k => obj?.[k]).find(v => v !== undefined && v !== null && v !== "");
}

function normalizeCard(raw) {
  return {
    id: pick(raw, "id", "slug", "series_id", "comic_id") ?? "",
    title: pick(raw, "title", "name", "series_title", "comic_title") ?? "(Tanpa judul)",
    cover: pick(raw, "cover", "cover_image", "thumbnail", "thumb", "image", "cover_image_url") ?? "",
    chapter: pick(raw, "latest_chapter", "chapter", "last_chapter", "newest_chapter") ?? "",
    description: pick(raw, "description", "synopsis", "summary") ?? "",
    status: pick(raw, "status") ?? "",
    tags: raw?.genres || raw?.genre || raw?.tags || [],
    author: pick(raw, "author", "author_name") ?? "",
    type: "shinigami"
  };
}

function normalizeChapter(raw) {
  return {
    id: String(raw?.id ?? raw?.chapter_id ?? raw?.slug ?? ""),
    chapter: String(raw?.chapter_number ?? raw?.chapter ?? raw?.number ?? raw?.name ?? "").replace(/^chapter\s*/i, ""),
    title: raw?.title || raw?.chapter_title || ""
  };
}

app.get("/api/shinigami/latest", async (req, res) => {
  if (!requireUpstream(res)) return;
  try {
    const data = await getJson("/latest"); // TODO: match your upstream's route
    const list = Array.isArray(data) ? data : (data.data || data.results || []);
    res.json(list.map(normalizeCard).slice(0, 30));
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/shinigami/popular", async (req, res) => {
  if (!requireUpstream(res)) return;
  try {
    const data = await getJson("/popular"); // TODO: match your upstream's route
    const list = Array.isArray(data) ? data : (data.data || data.results || []);
    res.json(list.map(normalizeCard).slice(0, 30));
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/shinigami/search", async (req, res) => {
  if (!requireUpstream(res)) return;
  const q = String(req.query.q || "").trim();
  if (!q) return res.json([]);
  try {
    const data = await getJson(`/search?q=${encodeURIComponent(q)}`); // TODO: match your upstream
    const list = Array.isArray(data) ? data : (data.data || data.results || []);
    res.json(list.map(normalizeCard).slice(0, 30));
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/shinigami/genres", async (req, res) => {
  if (!requireUpstream(res)) return;
  try {
    const data = await getJson("/genres"); // TODO: match your upstream
    const list = Array.isArray(data) ? data : (data.data || data.results || []);
    res.json(list.map(g => ({ id: g.id ?? g.slug ?? g, name: g.name ?? g.title ?? String(g) })));
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/shinigami/genre", async (req, res) => {
  if (!requireUpstream(res)) return;
  const slug = String(req.query.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "missing slug" });
  try {
    const data = await getJson(`/genre/${encodeURIComponent(slug)}`); // TODO: match your upstream
    const list = Array.isArray(data) ? data : (data.data || data.results || []);
    res.json(list.map(normalizeCard).slice(0, 30));
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/shinigami/detail", async (req, res) => {
  if (!requireUpstream(res)) return;
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "missing id" });
  try {
    const data = await getJson(`/series/${encodeURIComponent(id)}`); // TODO: match your upstream
    const card = normalizeCard(data);
    const chaptersRaw = data.chapters || data.chapter_list || [];
    res.json({ ...card, id, chapters: chaptersRaw.map(normalizeChapter) });
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/shinigami/pages", async (req, res) => {
  if (!requireUpstream(res)) return;
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "missing id" });
  try {
    const data = await getJson(`/chapter/${encodeURIComponent(id)}`); // TODO: match your upstream
    const images = data.images || data.pages || data.data?.images || [];
    res.json(images.map(img => (typeof img === "string" ? img : img.url || img.src)).filter(Boolean));
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/", (req, res) => res.send(
  UPSTREAM
    ? `Ninzy Core — Shinigami bridge is running, upstream: ${UPSTREAM}`
    : "Ninzy Core — Shinigami bridge is running, but SHINIGAMI_API_BASE is not set yet. See the comment at the top of server.js."
));

app.listen(PORT, () => console.log(`Shinigami bridge jalan di http://localhost:${PORT} (upstream: ${UPSTREAM || "belum diatur"})`));
