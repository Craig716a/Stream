import { Router, type Request } from "express";

type JsonResponse = {
  json: (body: unknown) => void;
};

const router = Router();

router.get("/healthz", (_req: Request, res: JsonResponse) => {
  res.json({ status: "ok" });
});

export default router;
