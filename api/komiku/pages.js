import * as cheerio from "cheerio";
import { getHtml, absUrl, withCors } from "../_lib/komiku.js";

export default async function handler(req, res) {
  withCors(res);
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "missing id" });
  try {
    const url = `https://komiku.org/${id}/`;
    const html = await getHtml(url);
    const $ = cheerio.load(html);

    let imgs = $('#Baca_Komik img, .chapter-image img, .readerarea img, #readerarea img').map((_, e) => $(e).attr("src") || $(e).attr("data-src")).get();
    if (!imgs.length) {
      imgs = $("article img, main img").map((_, e) => $(e).attr("src") || $(e).attr("data-src")).get()
        .filter(src => src && /\/(uploads|img|images)\//i.test(src) && !/logo|icon|avatar/i.test(src));
    }
    res.status(200).json(imgs.map(absUrl).filter(Boolean));
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
}
