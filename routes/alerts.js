import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import Alert from "../models/Alert.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { validateQuery } from "../utils/validation.js";

const router = Router();

// Mock data fallback
const mockAlerts = [
  { _id: "mock-1", name: "Temperature Control", severity: "critical", active: true },
  { _id: "mock-2", name: "Pressure System",     severity: "critical", active: true },
  { _id: "mock-3", name: "CD's",                severity: "critical", active: true },
  { _id: "mock-4", name: "Coolant Flow",         severity: "warning",  active: true },
  { _id: "mock-5", name: "Humidity Level",       severity: "warning",  active: true },
  { _id: "mock-6", name: "Material Feed",        severity: "warning",  active: true },
];

const alertsQuerySchema = z.object({
  severity: z.enum(["critical", "warning"]).optional(),
  active:   z.enum(["true", "false"]).optional(),
});

// ── GET /api/alerts ───────────────────────────────────────────
// List all alerts, optionally filtered by severity or active status
router.get("/", validateQuery(alertsQuerySchema), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ data: mockAlerts, total: mockAlerts.length });
    }

    const filter = {};
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.active !== undefined) filter.active = req.query.active === "true";

    const alerts = await Alert.find(filter).sort({ severity: 1, name: 1 }).lean();
    res.json({ data: alerts, total: alerts.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

// ── GET /api/alerts/summary ───────────────────────────────────
// Count of active alerts by severity
router.get("/summary", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        critical: mockAlerts.filter((a) => a.severity === "critical" && a.active).length,
        warning:  mockAlerts.filter((a) => a.severity === "warning"  && a.active).length,
      });
    }

    const [critical, warning] = await Promise.all([
      Alert.countDocuments({ severity: "critical", active: true }),
      Alert.countDocuments({ severity: "warning",  active: true }),
    ]);

    res.json({ critical, warning });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// ── PATCH /api/alerts/:id/acknowledge ────────────────────────
// Deactivate an alert (marks it as acknowledged — hides from overview/recommendations)
router.patch("/:id/acknowledge", authenticate, async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true }
    );
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    res.json({ data: alert });
  } catch (err) {
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});

// ── PATCH /api/alerts/:id/resolve ────────────────────────────
// Alias for acknowledge in the current model
router.patch("/:id/resolve", authenticate, async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true }
    );
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    res.json({ data: alert });
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve alert" });
  }
});

// ── PATCH /api/alerts/:id/reopen ─────────────────────────────
// Reactivate a resolved alert
router.patch("/:id/reopen", authenticate, authorize("admin"), async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { active: true },
      { new: true }
    );
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    res.json({ data: alert });
  } catch (err) {
    res.status(500).json({ error: "Failed to reopen alert" });
  }
});

// ── PATCH /api/alerts/bulk-acknowledge ───────────────────────
// Deactivate multiple alerts at once
router.patch("/bulk-acknowledge", authenticate, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids array required" });
  }
  try {
    const result = await Alert.updateMany(
      { _id: { $in: ids }, active: true },
      { active: false }
    );
    res.json({ acknowledged: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: "Failed to bulk acknowledge alerts" });
  }
});

export default router;
