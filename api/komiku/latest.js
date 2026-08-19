import { BASE, getHtml, parseCards, withCors } from "../_lib/komiku.js";

export default async function handler(req, res) {
  withCors(res);
  try {
    const html = await getHtml(`${BASE}/pustaka/?orderby=date`);
    res.status(200).json(parseCards(html).slice(0, 30));
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
}
