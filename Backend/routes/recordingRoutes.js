import express from "express";
import upload from "../middleware/upload.js";
import { uploadRecording } from "../controllers/recordingController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/upload", protect, upload.single("audio"), uploadRecording);

export default router;