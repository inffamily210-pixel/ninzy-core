import { BASE, getHtml, parseCards, withCors } from "../_lib/komiku.js";

export default async function handler(req, res) {
  withCors(res);
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(200).json([]);
  try {
    const html = await getHtml(`${BASE}/?s=${encodeURIComponent(q)}`);
    res.status(200).json(parseCards(html).slice(0, 30));
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
}
