/**
 * NINZY CORE — Komiku proxy server
 * ---------------------------------------------------------------
 * Komiku.org TIDAK menyediakan API publik/CORS-terbuka, jadi
 * frontend Ninzy Core tidak bisa memanggilnya langsung dari
 * browser. Server kecil ini men-scrape halaman Komiku di sisi
 * server (Node), lalu mengembalikannya sebagai JSON rapi + header
 * CORS, sesuai kontrak yang dipakai app.js (lihat komentar Komiku
 * adapter di app.js).
 *
 * PENTING — INI SCRAPER, BUKAN API RESMI:
 *  - Selector CSS di bawah dibuat berdasarkan struktur halaman
 *    Komiku saat skrip ini ditulis. Situs bisa berubah sewaktu-waktu
 *    dan scraper bisa berhenti bekerja — cek dengan `curl` /
 *    DevTools lalu sesuaikan selector jika hasil kosong.
 *  - Gunakan secara wajar (rate-limit dirimu sendiri), hormati
 *    robots.txt & ToS Komiku, dan jangan jadikan proxy publik yang
 *    menerima trafik besar dari orang lain.
 *  - Cache in-memory (5 menit) disertakan agar tidak membebani
 *    Komiku dengan request berulang.
 *
 * DEPLOY:
 *   cd komiku-proxy && npm install && npm start
 *   (atau deploy folder ini ke Render / Railway / Fly.io / VPS)
 *   lalu tempel URL publiknya ke Ninzy Core lewat tombol "Sumber".
 */
import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";
import fetch from "node-fetch";
import NodeCache from "node-cache";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8787;
const BASE = "https://komiku.org";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes

async function getHtml(url) {
  const cached = cache.get(url);
  if (cached) return cached;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "id,en;q=0.8" } });
  if (!res.ok) throw new Error(`Fetch ${url} -> ${res.status}`);
  const html = await res.text();
  cache.set(url, html);
  return html;
}

function absUrl(u) {
  if (!u) return "";
  try { return new URL(u, BASE).toString(); } catch { return u; }
}

function slugFromUrl(u) {
  const parts = (u || "").replace(/\/$/, "").split("/");
  return parts[parts.length - 1] || "";
}

/**
 * Parses a grid of manga "cards" from a Komiku listing page.
 * Komiku consistently wraps each entry as:
 *   <a href="https://komiku.org/manga/{slug}/"><img ...></a>
 *   <h3 or h4><a href="same-url">Title</a></h3>
 *   text containing "<Genre> · <views>" and a chapter link.
 * We look for every <a href="*/manga/*/"> as the anchor and walk
 * up to its nearest card-like ancestor to gather title/cover/chapter.
 */
function parseCards(html) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const items = [];

  $('a[href*="/manga/"]').each((_, el) => {
    const href = absUrl($(el).attr("href"));
    if (!/\/manga\/[^/]+\/?$/.test(href)) return;
    const id = slugFromUrl(href);
    if (seen.has(id)) return;

    // climb to a reasonably-sized container to search siblings for title/chapter
    let container = $(el);
    for (let i = 0; i < 4 && container.parent().length; i++) container = container.parent();

    const img = $(el).find("img").attr("data-src") || $(el).find("img").attr("src") || container.find("img").first().attr("data-src") || container.find("img").first().attr("src");
    const titleEl = container.find(`a[href="${$(el).attr("href")}"]`).filter((i, e) => $(e).text().trim().length > 0).first();
    const title = (titleEl.text() || $(el).find("img").attr("alt") || "").trim().replace(/^Baca (Manga|Manhwa|Manhua|Komik)\s*/i, "");
    if (!title) return;

    const chapterLink = container.find('a[href*="-chapter-"]').first();
    const chapterText = chapterLink.text().trim().replace(/^Chapter\s*/i, "");

    seen.add(id);
    items.push({
      id,
      title,
      cover: absUrl(img),
      chapter: chapterText || "",
      type: "komiku"
    });
  });

  return items;
}

app.get("/api/komiku/latest", async (req, res) => {
  try {
    const html = await getHtml(`${BASE}/pustaka/?orderby=date`);
    res.json(parseCards(html).slice(0, 30));
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/komiku/popular", async (req, res) => {
  try {
    const html = await getHtml(`${BASE}/pustaka/?orderby=meta_value_num`);
    res.json(parseCards(html).slice(0, 30));
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/komiku/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json([]);
  try {
    const html = await getHtml(`${BASE}/?s=${encodeURIComponent(q)}`);
    res.json(parseCards(html).slice(0, 30));
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

// Static list of common Komiku genre slugs (https://komiku.org/genre/{slug}/).
// Komiku doesn't expose these via an API, so we hardcode the popular ones;
// edit this list if Komiku adds/renames genres.
const KOMIKU_GENRES = [
  { id: "isekai", name: "Isekai" }, { id: "fantasy", name: "Fantasy" },
  { id: "action", name: "Action" }, { id: "romance", name: "Romance" },
  { id: "comedy", name: "Comedy" }, { id: "drama", name: "Drama" },
  { id: "adventure", name: "Adventure" }, { id: "school-life", name: "School Life" },
  { id: "martial-arts", name: "Martial Arts" }, { id: "supernatural", name: "Supernatural" },
  { id: "horror", name: "Horror" }, { id: "mystery", name: "Mystery" },
  { id: "seinen", name: "Seinen" }, { id: "shounen", name: "Shounen" },
  { id: "slice-of-life", name: "Slice of Life" }, { id: "ecchi", name: "Ecchi" }
];

app.get("/api/komiku/genres", (req, res) => res.json(KOMIKU_GENRES));

app.get("/api/komiku/genre", async (req, res) => {
  const slug = String(req.query.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "missing slug" });
  try {
    const html = await getHtml(`${BASE}/genre/${slug}/`);
    res.json(parseCards(html).slice(0, 30));
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/komiku/detail", async (req, res) => {
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "missing id" });
  try {
    const url = `${BASE}/manga/${id}/`;
    const html = await getHtml(url);
    const $ = cheerio.load(html);

    const title = $("h1").first().text().trim().replace(/^Komik\s*/i, "") || $('meta[property="og:title"]').attr("content") || id;
    const cover = absUrl($('.ims img, .thumb img, article img').first().attr("src") || $('meta[property="og:image"]').attr("content"));
    const description = $('.desc, .komik_info-description-sinopsis, #Sinopsis, .entry-content p').first().text().trim()
      || $('meta[name="description"]').attr("content") || "";
    const tags = $('a[href*="/genre/"]').map((_, e) => $(e).text().trim()).get().filter(Boolean);
    const statusText = $('body').text().match(/Status\s*[:\-]?\s*(Ongoing|Tamat|Completed)/i);
    const status = statusText ? statusText[1] : "";
    const author = ($('body').text().match(/Pengarang\s*[:\-]?\s*([^\n]+)/i) || [])[1]?.trim() || "";

    // Chapter links look like https://komiku.org/{slug}-chapter-{num}/
    const chapters = [];
    const chSeen = new Set();
    $('a[href*="-chapter-"]').each((_, el) => {
      const href = absUrl($(el).attr("href"));
      const cid = slugFromUrl(href);
      if (chSeen.has(cid)) return;
      chSeen.add(cid);
      const m = cid.match(/-chapter-([\d.]+)$/i);
      chapters.push({
        id: cid,
        chapter: m ? m[1] : $(el).text().replace(/[^\d.]/g, ""),
        title: $(el).text().trim()
      });
    });
    chapters.sort((a, b) => parseFloat(a.chapter) - parseFloat(b.chapter));

    res.json({ id, title, cover, description, status, tags, author, chapters });
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/api/komiku/pages", async (req, res) => {
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "missing id" });
  try {
    const url = `${BASE}/${id}/`;
    const html = await getHtml(url);
    const $ = cheerio.load(html);

    // Reader images usually live inside the main chapter content area.
    // Try a few likely containers, fall back to filtering all <img> by src pattern.
    let imgs = $('#Baca_Komik img, .chapter-image img, .readerarea img, #readerarea img').map((_, e) => $(e).attr("src") || $(e).attr("data-src")).get();
    if (!imgs.length) {
      imgs = $("article img, main img").map((_, e) => $(e).attr("src") || $(e).attr("data-src")).get()
        .filter(src => src && /\/(uploads|img|images)\//i.test(src) && !/logo|icon|avatar/i.test(src));
    }
    res.json(imgs.map(absUrl).filter(Boolean));
  } catch (err) { res.status(502).json({ error: String(err) }); }
});

app.get("/", (req, res) => res.send("Ninzy Core — Komiku proxy is running. See /api/komiku/latest, /api/komiku/popular, /api/komiku/search, /api/komiku/detail, /api/komiku/pages"));

app.listen(PORT, () => console.log(`Komiku proxy jalan di http://localhost:${PORT}`));
