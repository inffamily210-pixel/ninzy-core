import { getJson, normalizeCard, normalizeChapter, withCors, handleError } from "../_lib/shinigami.js";

// TODO: adjust path to your upstream API's series-detail route
// (commonly something like /series/{id} or /comic/{id}).
export default async function handler(req, res) {
  withCors(res);
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "missing id" });
  try {
    const data = await getJson(`/series/${encodeURIComponent(id)}`);
    const card = normalizeCard(data);
    const chaptersRaw = data.chapters || data.chapter_list || [];
    res.status(200).json({ ...card, id, chapters: chaptersRaw.map(normalizeChapter) });
  } catch (err) {
    handleError(res, err);
  }
}
