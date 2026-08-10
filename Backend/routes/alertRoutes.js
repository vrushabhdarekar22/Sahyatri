import express from "express";
import {
  getAlerts,
  updateAlertAudio,
  resolveAlert,
  resolveAllUserAlerts,
} from "../controllers/alertController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getAlerts);
router.put("/resolve-all", protect, resolveAllUserAlerts);
router.put("/:alertId/audio", protect, updateAlertAudio);
router.put("/:alertId/resolve", protect, resolveAlert);

export default router;