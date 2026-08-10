import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  addGuardian,
  getMyGuardians,
  removeGuardian,
  getMonitoredTravellers,
} from "../controllers/guardianController.js";

const router = express.Router();

router.post("/add", protect, addGuardian);
router.get("/my-guardians", protect, getMyGuardians);
router.get("/monitored-travellers", protect, getMonitoredTravellers);
router.delete("/:guardianId", protect, removeGuardian);

export default router;
