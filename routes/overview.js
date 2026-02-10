import { Router } from "express";
import mongoose from "mongoose";
import Alert from "../models/Alert.js";

const router = Router();

const mockOverviewData = {
  criticalAlerts: {
    count: 3,
    subtitle: "Requires immediate attention",
    affectedParameters: [
      { id: 1, name: "Temperature Control", checked: false },
      { id: 2, name: "Pressure System", checked: false },
      { id: 3, name: "CD's", checked: false },
    ],
  },
  warnings: {
    count: 3,
    subtitle: "Monitoring required",
    affectedParameters: [
      { id: 1, name: "Coolant Flow", checked: false },
      { id: 2, name: "Humidity Level", checked: false },
      { id: 3, name: "Material Feed", checked: false },
    ],
  },
};

router.get("/", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json(mockOverviewData);
    }

    const alerts = await Alert.find({ active: true }).lean();

    const critical = alerts.filter((a) => a.severity === "critical");
    const warning = alerts.filter((a) => a.severity === "warning");

    res.json({
      criticalAlerts: {
        count: critical.length,
        subtitle: "Requires immediate attention",
        affectedParameters: critical.map((a, i) => ({
          id: i + 1,
          name: a.name,
          checked: false,
        })),
      },
      warnings: {
        count: warning.length,
        subtitle: "Monitoring required",
        affectedParameters: warning.map((a, i) => ({
          id: i + 1,
          name: a.name,
          checked: false,
        })),
      },
    });
  } catch (err) {
    res.json(mockOverviewData);
  }
});

export default router;
