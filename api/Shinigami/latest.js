import { getJson, normalizeCard, withCors, handleError } from "../_lib/shinigami.js";

// TODO: adjust this path to match whatever upstream API you configure
// via SHINIGAMI_API_BASE — this is a common convention, not a verified
// endpoint. See the big comment in api/_lib/shinigami.js.
export default async function handler(req, res) {
  withCors(res);
  try {
    const data = await getJson("/latest");
    const list = Array.isArray(data) ? data : (data.data || data.results || []);
    res.status(200).json(list.map(normalizeCard).slice(0, 30));
  } catch (err) {
    handleError(res, err);
  }
}
