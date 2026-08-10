import express from "express";

import {
  createTrip,
  getMyTrips,
  getActiveTrip,
  startTrip,
  completeTrip,
} from "../controllers/tripController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// you must be authenticated before creating Trip
router.post("/", protect, createTrip);
router.get("/", protect, getMyTrips);
router.get("/active", protect, getActiveTrip);
router.put("/:id/start", protect, startTrip);
router.put("/:id/complete", protect, completeTrip);

export default router;