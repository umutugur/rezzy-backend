import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import app from "./app.js";
import "./jobs/noshow.job.js"; // cron

dotenv.config();
await connectDB(process.env.MONGO_URI);
app.listen(process.env.PORT, () => console.log(`🚀 Rezzy API: http://localhost:${process.env.PORT}`));
