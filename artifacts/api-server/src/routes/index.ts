import { Router } from "express";
import healthRouter from "./health.js";
import tmdbRouter from "./tmdb.js";

const router = Router();

router.use(healthRouter);
router.use(tmdbRouter);

export default router;
