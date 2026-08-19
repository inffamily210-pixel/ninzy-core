import { getJson, withCors, handleError } from "../_lib/shinigami.js";

// TODO: adjust path to your upstream API's chapter-images route
// (commonly something like /chapter/{id} returning an images array).
export default async function handler(req, res) {
  withCors(res);
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "missing id" });
  try {
    const data = await getJson(`/chapter/${encodeURIComponent(id)}`);
    const images = data.images || data.pages || data.data?.images || [];
    res.status(200).json(images.map(img => (typeof img === "string" ? img : img.url || img.src)).filter(Boolean));
  } catch (err) {
    handleError(res, err);
  }
}
