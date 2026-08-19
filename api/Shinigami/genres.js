import { getJson, withCors, handleError } from "../_lib/shinigami.js";

export default async function handler(req, res) {
  withCors(res);
  try {
    const data = await getJson("/genres");
    const list = Array.isArray(data) ? data : (data.data || data.results || []);
    res.status(200).json(list.map(g => ({ id: g.id ?? g.slug ?? g, name: g.name ?? g.title ?? String(g) })));
  } catch (err) {
    handleError(res, err);
  }
}
