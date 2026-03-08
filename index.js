import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { config } from "./config/env.js";
import { setupWebSocket } from "./utils/websocket.js";
import { startChangeStream, stopChangeStream } from "./workers/changeStream.js";
import { disconnectPg } from "./db/pool.js";
import authRoutes from "./routes/auth.js";
import overviewRoutes from "./routes/overview.js";
import recommendationsRoutes from "./routes/recommendations.js";
import demoRoutes from "./routes/demo.js";
import alertRoutes from "./routes/alerts.js";
import qualityParametersRoutes from "./routes/quality-parameters.js";
import machineHealthRoutes from "./routes/machine-health.js";
import settingsRoutes from "./routes/settings.js";
import productionMetricsRoutes from "./routes/production-metrics.js";
import notificationsRoutes from "./routes/notifications.js";
import rulesRoutes from "./routes/rules.js";
import lotsRoutes from "./routes/lots.js";
import maintenanceRoutes from "./routes/maintenance.js";
import cdMeasurementsRoutes from "./routes/cd-measurements.js";
import adminUsersRoutes from "./routes/admin/users.js";
import landingKeysRoutes from "./routes/admin/landing-keys.js";
import localizationRoutes from "./routes/localization.js";

const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1);

// ── Security ──────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: config.CORS_ORIGIN.split(",").map((o) => o.trim()),
    credentials: true,
  })
);

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ── Rate limiting ─────────────────────────────────────────────
// Strict limit on auth routes — brute force protection
app.use(
  "/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 min
    max: 30,
    standardHeaders: true,
    message: { error: "Too many requests, please try again later" },
  })
);

// General limit on all API routes
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    message: { error: "Too many requests" },
  })
);

// ── Routes ────────────────────────────────────────────────────
app.use("/auth", authRoutes);
app.use("/api/overview", overviewRoutes);
app.use("/api/recommendations", recommendationsRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/demo-request", demoRoutes);
app.use("/api/quality-parameters", qualityParametersRoutes);
app.use("/api/machine-health", machineHealthRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/production-metrics", productionMetricsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/rules", rulesRoutes);
app.use("/api/lots", lotsRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/cd-measurements", cdMeasurementsRoutes);
app.use("/api/admin/users", adminUsersRoutes);
app.use("/api/admin/landing-keys", landingKeysRoutes);
app.use("/api/localization", localizationRoutes);

// ── Health ────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── 404 ───────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[error]", err.message);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// ── Database ──────────────────────────────────────────────────
mongoose
  .connect(config.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB");
    await startChangeStream();
  })
  .catch((err) => {
    console.warn("MongoDB connection failed:", err.message);
  });

// ── Start ─────────────────────────────────────────────────────
setupWebSocket(server);

server.listen(config.PORT, () => {
  console.log(`Server running on http://localhost:${config.PORT}`);
});

// ── Graceful shutdown ─────────────────────────────────────────
process.on("SIGTERM", () => {
  server.close(async () => {
    await stopChangeStream();
    await disconnectPg();
    await mongoose.disconnect();
    process.exit(0);
  });
});
