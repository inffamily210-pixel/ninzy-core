import { LIST_API, getHtml, parseCards } from "./_lib/komiku.js";

export default async function handler(req, res) {
  try {
    const html = await getHtml(`${LIST_API}?orderby=meta_value_num`);
    const items = parseCards(html);
    res.status(200).json({ count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
