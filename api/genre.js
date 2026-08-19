import { BASE, getHtml, parseCards, withCors } from "./_lib/komiku.js";

export default async function handler(req, res) {
  withCors(res);
  const slug = String(req.query.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "missing slug" });
  try {
    const html = await getHtml(`${BASE}/genre/${slug}/`);
    res.status(200).json(parseCards(html).slice(0, 30));
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
}
