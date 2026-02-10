import { Router } from "express";
import mongoose from "mongoose";
import Alert from "../models/Alert.js";
import Recommendation from "../models/Recommendation.js";
import {
  validateQuery,
  recommendationsQuerySchema,
} from "../utils/validation.js";

const router = Router();

const mockRecommendationsData = [
  { id: 1, title: "Temperature Control Frequency", impact: "High Impact" },
  { id: 2, title: "Calibration Procedure", impact: "High Impact" },
  { id: 3, title: "Material Feed Rate", impact: "Medium Impact" },
  { id: 4, title: "Operator Training", impact: "Medium Impact" },
  { id: 5, title: "Humidity Control", impact: "Low Impact" },
];

const IMPACT_RANK = {
  "High Impact": 0,
  "Medium Impact": 1,
  "Low Impact": 2,
};

function rankRecommendations(recommendations, criticalParamNames) {
  return recommendations.sort((a, b) => {
    const impactDiff = IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact];
    if (impactDiff !== 0) return impactDiff;

    const aHasCritical = a.relatedParameters.some((p) =>
      criticalParamNames.has(p),
    );
    const bHasCritical = b.relatedParameters.some((p) =>
      criticalParamNames.has(p),
    );
    if (aHasCritical !== bHasCritical) return aHasCritical ? -1 : 1;

    return a.sortOrder - b.sortOrder;
  });
}

router.get(
  "/",
  validateQuery(recommendationsQuerySchema),
  async (req, res) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.json(mockRecommendationsData);
      }

      const { severity, parameter } = req.query;

      const activeAlerts = await Alert.find({ active: true }).lean();

      const criticalParamNames = new Set(
        activeAlerts
          .filter((a) => a.severity === "critical")
          .map((a) => a.name),
      );

      let recommendations = await Recommendation.find({ active: true }).lean();

      if (severity) {
        const paramNames = new Set(
          activeAlerts
            .filter((a) => a.severity === severity)
            .map((a) => a.name),
        );
        recommendations = recommendations.filter((r) =>
          r.relatedParameters.some((p) => paramNames.has(p)),
        );
      }

      if (parameter) {
        recommendations = recommendations.filter((r) =>
          r.relatedParameters.includes(parameter),
        );
      }

      const ranked = rankRecommendations(recommendations, criticalParamNames);

      res.json(
        ranked.map((r, i) => ({
          id: i + 1,
          title: r.title,
          impact: r.impact,
        })),
      );
    } catch (err) {
      res.json(mockRecommendationsData);
    }
  },
);

export default router;
