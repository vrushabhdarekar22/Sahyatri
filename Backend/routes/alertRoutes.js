import express from "express";

import {
  getAlerts,
  updateAlertAudio
}
from "../controllers/alertController.js";

const router = express.Router();

router.get("/", getAlerts);
router.put("/:alertId/audio",updateAlertAudio);

export default router;