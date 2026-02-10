import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { config } from "./config/env.js";
import { seedDatabase } from "./utils/seed.js";
import authRoutes from "./routes/auth.js";
import overviewRoutes from "./routes/overview.js";
import recommendationsRoutes from "./routes/recommendations.js";
import demoRoutes from "./routes/demo.js";

const app = express();

app.use(
  cors({
    origin: "http://localhost:3001",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.use("/auth", authRoutes);
app.use("/api/overview", overviewRoutes);
app.use("/api/recommendations", recommendationsRoutes);
app.use("/api/demo-request", demoRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

mongoose
  .connect(config.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB");
    await seedDatabase();
  })
  .catch((err) => {
    console.warn("MongoDB not available, using mock data:", err.message);
  });

app.listen(config.PORT, () => {
  console.log(`Server running on http://localhost:${config.PORT}`);
});
