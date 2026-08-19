import * as cheerio from "cheerio";
import { BASE, getHtml } from "./_lib/komiku.js";

export default async function handler(req, res) {
  try {
    const html = await getHtml(`${BASE}/pustaka/?orderby=meta_value_num`);
    const $ = cheerio.load(html);
    const anchors = $('a[href*="/manga/"]');
    const first = anchors.first();

    res.status(200).json({
      anchorCount: anchors.length,
      firstHref: first.attr("href"),
      firstAnchorHtml: $.html(first),
      firstParentHtml: $.html(first.parent()),
      firstGrandparentHtml: $.html(first.parent().parent())
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
