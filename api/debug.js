import * as cheerio from "cheerio";
import { getHtml } from "./_lib/komiku.js";

export default async function handler(req, res) {
  try {
    const html = await getHtml("https://api.komiku.org/manga/?orderby=meta_value_num");
    const $ = cheerio.load(html);
    const anchors = $('a[href*="/manga/"]');

    res.status(200).json({
      length: html.length,
      anchorCount: anchors.length,
      snippet: html.slice(0, 1500)
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
