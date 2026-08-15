import express from "express";
import { buildApiResponse } from "../services/apiService.js";

const router = express.Router();

router.get(["/", ""], (req, res) => {
  res.json(buildApiResponse({ ok: true }));
});

export default router;
