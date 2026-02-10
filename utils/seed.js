import Alert from "../models/Alert.js";
import Recommendation from "../models/Recommendation.js";

const seedAlerts = [
  { name: "Temperature Control", severity: "critical" },
  { name: "Pressure System", severity: "critical" },
  { name: "CD's", severity: "critical" },
  { name: "Coolant Flow", severity: "warning" },
  { name: "Humidity Level", severity: "warning" },
  { name: "Material Feed", severity: "warning" },
];

const seedRecommendations = [
  {
    title: "Temperature Control Frequency",
    impact: "High Impact",
    relatedParameters: ["Temperature Control"],
    sortOrder: 1,
  },
  {
    title: "Calibration Procedure",
    impact: "High Impact",
    relatedParameters: ["Pressure System", "CD's"],
    sortOrder: 2,
  },
  {
    title: "Material Feed Rate",
    impact: "Medium Impact",
    relatedParameters: ["Material Feed"],
    sortOrder: 3,
  },
  {
    title: "Operator Training",
    impact: "Medium Impact",
    relatedParameters: ["Temperature Control", "Pressure System", "Material Feed"],
    sortOrder: 4,
  },
  {
    title: "Humidity Control",
    impact: "Low Impact",
    relatedParameters: ["Humidity Level", "Coolant Flow"],
    sortOrder: 5,
  },
];

export async function seedDatabase() {
  const alertCount = await Alert.countDocuments();
  if (alertCount === 0) {
    await Alert.insertMany(seedAlerts);
    console.log("Seeded alerts collection");
  }

  const recCount = await Recommendation.countDocuments();
  if (recCount === 0) {
    await Recommendation.insertMany(seedRecommendations);
    console.log("Seeded recommendations collection");
  }
}
