import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import tripRoutes from "./routes/tripRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import sosRoutes from "./routes/sosRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import routeRoutes from "./routes/routeRoutes.js";
import recordingRoutes from "./routes/recordingRoutes.js";
import guardianRoutes from "./routes/guardianRoutes.js";

const PORT = process.env.PORT || 5000;
const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps or curl) or matched origins
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// Health Check Endpoint for Render / Cloud Probes
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Sahyatri backend is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/guardian", guardianRoutes);
app.use("/api/sos", sosRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/recordings", recordingRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

connectDB();

app.listen(PORT, () => {
  console.log(`Server started at Port ${PORT}`);
});