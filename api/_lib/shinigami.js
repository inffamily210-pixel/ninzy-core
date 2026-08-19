/**
 * Shinigami adapter — IMPORTANT DIFFERENCE FROM KOMIKU:
 * ---------------------------------------------------------------
 * Komiku's site is server-rendered HTML, so a simple fetch+cheerio
 * scraper (see api/_lib/komiku.js) can read it directly.
 *
 * Shinigami (app.shinigami.asia and its many past domains) is a
 * client-rendered single-page app: the HTML Vercel/your server would
 * fetch is basically an empty shell — the manga list, covers, and
 * chapter data are all loaded afterwards by JavaScript calling
 * Shinigami's own backend JSON API. A cheerio scraper cannot see
 * that content, and the site also sits behind Cloudflare bot
 * protection, so even a plain HTTP request to the *right* endpoint
 * can get blocked without a real browser fingerprint.
 *
 * Being honest about that: this file does NOT ship a working
 * Shinigami scraper out of the box. Instead it's a thin, flexible
 * "bring your own JSON API" adapter — you point it at a JSON API
 * that already knows how to talk to Shinigami (for example a
 * self-reverse-engineered endpoint, or a community project such as
 * github.com/Sansekai/Unofficial-Shinigami-Api or
 * github.com/AzwarKusumah/ryukoapi-shinigami — review their code
 * before trusting them, they're third-party and unverified by us),
 * and this file normalizes whatever JSON shape it returns into the
 * format Ninzy Core expects.
 *
 * Configure the upstream API base via the SHINIGAMI_API_BASE
 * environment variable (Vercel: Project Settings → Environment
 * Variables). Until that's set, every endpoint below returns a
 * clear "not configured" error instead of silently failing.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

export function upstreamBase() {
  return (process.env.SHINIGAMI_API_BASE || "").replace(/\/$/, "");
}

export function requireUpstream() {
  if (!upstreamBase()) {
    const err = new Error("SHINIGAMI_API_BASE belum diatur di environment variables server ini.");
    err.code = "UPSTREAM_NOT_CONFIGURED";
    throw err;
  }
}

export async function getJson(path) {
  requireUpstream();
  const url = `${upstreamBase()}${path}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.json;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Upstream Shinigami API error ${res.status} (${url})`);
  const json = await res.json();
  cache.set(url, { json, t: Date.now() });
  return json;
}

/**
 * Normalizes a manga/comic entry from an unknown upstream JSON shape
 * into Ninzy Core's card format. Tries several common field names
 * since different community APIs name things differently.
 */
export function normalizeCard(raw) {
  const pick = (...keys) => keys.map(k => raw?.[k]).find(v => v !== undefined && v !== null && v !== "");
  return {
    id: pick("id", "slug", "series_id", "comic_id") ?? "",
    title: pick("title", "name", "series_title", "comic_title") ?? "(Tanpa judul)",
    cover: pick("cover", "cover_image", "thumbnail", "thumb", "image", "cover_image_url") ?? "",
    chapter: pick("latest_chapter", "chapter", "last_chapter", "newest_chapter") ?? "",
    description: pick("description", "synopsis", "summary") ?? "",
    status: pick("status") ?? "",
    tags: raw?.genres || raw?.genre || raw?.tags || [],
    author: pick("author", "author_name") ?? "",
    type: "shinigami"
  };
}

export function normalizeChapter(raw) {
  return {
    id: String(raw?.id ?? raw?.chapter_id ?? raw?.slug ?? ""),
    chapter: String(raw?.chapter_number ?? raw?.chapter ?? raw?.number ?? raw?.name ?? "").replace(/^chapter\s*/i, ""),
    title: raw?.title || raw?.chapter_title || ""
  };
}

export function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
}

export function handleError(res, err) {
  if (err.code === "UPSTREAM_NOT_CONFIGURED") {
    return res.status(501).json({ error: err.message, hint: "Set SHINIGAMI_API_BASE env var. Lihat komentar di api/_lib/shinigami.js." });
  }
  return res.status(502).json({ error: String(err.message || err) });
}
