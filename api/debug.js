import { BASE, getHtml } from "./_lib/komiku.js";

export default async function handler(req, res) {
  try {
    const html = await getHtml(`${BASE}/pustaka/?orderby=meta_value_num`);
    res.status(200).json({
      length: html.length,
      hasMangaLink: html.includes("/manga/"),
      snippet: html.slice(0, 1000)
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
