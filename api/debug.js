import * as cheerio from "cheerio";
import { BASE, getHtml } from "./_lib/komiku.js";

export default async function handler(req, res) {
  try {
    const html = await getHtml(`${BASE}/pustaka/?orderby=meta_value_num`);
    const $ = cheerio.load(html);

    const allHrefs = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (href && href.startsWith(BASE) && href !== BASE + "/") allHrefs.push(href);
    });

    const idx = html.indexOf("/manga/");

    res.status(200).json({
      totalAnchors: $("a").length,
      sampleHrefs: [...new Set(allHrefs)].slice(0, 25),
      mangaSubstringContext: idx >= 0 ? html.slice(Math.max(0, idx - 150), idx + 150) : null
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
      }
