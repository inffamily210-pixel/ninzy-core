import * as cheerio from "cheerio";
import { BASE, getHtml, absUrl, slugFromUrl, withCors } from "../_lib/komiku.js";

export default async function handler(req, res) {
  withCors(res);
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

    const chapters = [];
    const chSeen = new Set();
    $('a[href*="-chapter-"]').each((_, el) => {
      const href = absUrl($(el).attr("href"));
      const cid = slugFromUrl(href);
      if (chSeen.has(cid)) return;
      chSeen.add(cid);
      const m = cid.match(/-chapter-([\d.]+)$/i);
      chapters.push({ id: cid, chapter: m ? m[1] : $(el).text().replace(/[^\d.]/g, ""), title: $(el).text().trim() });
    });
    chapters.sort((a, b) => parseFloat(a.chapter) - parseFloat(b.chapter));

    res.status(200).json({ id, title, cover, description, status, tags, author, chapters });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
}
