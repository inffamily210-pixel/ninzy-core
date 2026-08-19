import { getJson, normalizeCard, withCors, handleError } from "../_lib/shinigami.js";

export default async function handler(req, res) {
  withCors(res);
  const slug = String(req.query.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "missing slug" });
  try {
    const data = await getJson(`/genre/${encodeURIComponent(slug)}`);
    const list = Array.isArray(data) ? data : (data.data || data.results || []);
    res.status(200).json(list.map(normalizeCard).slice(0, 30));
  } catch (err) {
    handleError(res, err);
  }
}
