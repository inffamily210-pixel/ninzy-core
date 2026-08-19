import { KOMIKU_GENRES, withCors } from "../_lib/komiku.js";

export default function handler(req, res) {
  withCors(res);
  res.status(200).json(KOMIKU_GENRES);
}
