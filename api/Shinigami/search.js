import { getJson, normalizeCard, withCors, handleError } from "../_lib/shinigami.js";

// TODO: adjust path/query param name to your upstream API's search route.
export default async function handler(req, res) {
  withCors(res);
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(200).json([]);
  try {
    const data = await getJson(`/search?q=${encodeURIComponent(q)}`);
    const list = Array.isArray(data) ? data : (data.data || data.results || []);
    res.status(200).json(list.map(normalizeCard).slice(0, 30));
  } catch (err) {
    handleError(res, err);
  }
}
