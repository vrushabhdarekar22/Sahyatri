import express from "express";
import { getAlerts, updateAlertAudio } from "../controllers/alertController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getAlerts);
router.put("/:alertId/audio", protect, updateAlertAudio);

export default router;