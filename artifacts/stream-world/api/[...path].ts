import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../../api-server/src/app";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.url && !req.url.startsWith("/api")) {
    req.url = `/api${req.url.startsWith("/") ? "" : "/"}${req.url}`;
  }

  return app(req, res);
}
