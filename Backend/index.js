import express from "express"
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import tripRoutes from "./routes/tripRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import sosRoutes from "./routes/sosRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import routeRoutes from "./routes/routeRoutes.js";
import recordingRoutes from "./routes/recordingRoutes.js";

const PORT = process.env.PORT;

// loads variables stored in .env
dotenv.config();
const app = express();

app.use(express.json());

app.use("/api/auth", authRoutes);

app.use("/api/sos", sosRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/recordings",recordingRoutes);

connectDB();

app.listen(PORT,() => {
    console.log(`Server started at Port ${PORT}`);
})