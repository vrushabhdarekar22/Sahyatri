import express from "express"
import dotenv from "dotenv";
import connectDB from "./config/db.js";

const PORT = process.env.PORT;

// loads variables stored in .env
dotenv.config();
const app = express();

app.use(express.json());

connectDB();

app.listen(PORT,() => {
    console.log(`Server started at Port ${PORT}`);
})