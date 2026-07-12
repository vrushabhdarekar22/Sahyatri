import express from "express"
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import tripRoutes from "./routes/tripRoutes.js";
import authRoutes from "./routes/authRoutes.js";

const PORT = process.env.PORT;

// loads variables stored in .env
dotenv.config();
const app = express();

app.use(express.json());

app.use("/api/auth", authRoutes);

app.use("/api/sos", sosRoutes);
app.use("/api/trips", tripRoutes);

connectDB();

app.listen(PORT,() => {
    console.log(`Server started at Port ${PORT}`);
})