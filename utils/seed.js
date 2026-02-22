import argon2 from "argon2";
import Alert from "../models/Alert.js";
import Recommendation from "../models/Recommendation.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";

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

// ── Demo users ────────────────────────────────────────────────
const seedUsers = [
  { email: "admin@predixa.com", password: "admin123", name: "Demo Admin", role: "admin"  },
  { email: "user@predixa.com",  password: "user1234", name: "Demo User",  role: "user"   },
];

// ── Seed notifications for a user (only if none exist yet) ────
async function seedNotificationsFor(userId) {
  const exists = await Notification.countDocuments({ userId: userId.toString() });
  if (exists > 0) return;

  await Notification.insertMany([
    {
      userId:    userId.toString(),
      title:     "Temperature Critical",
      message:   "Machine A1 temperature exceeded 80°C",
      type:      "critical",
      read:      false,
      createdAt: new Date(Date.now() - 5  * 60 * 1000),
    },
    {
      userId:    userId.toString(),
      title:     "Pressure Warning",
      message:   "Pressure System approaching upper control limit",
      type:      "warning",
      read:      false,
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
    },
    {
      userId:    userId.toString(),
      title:     "Maintenance Due",
      message:   "Machine B3 maintenance window in next 48 hours",
      type:      "info",
      read:      false,
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    },
  ]);
}

export async function seedDatabase() {
  // ── Alerts ───────────────────────────────────────────────────
  const alertCount = await Alert.countDocuments();
  if (alertCount === 0) {
    await Alert.insertMany(seedAlerts);
    console.log("Seeded alerts collection");
  }

  // ── Recommendations ──────────────────────────────────────────
  const recCount = await Recommendation.countDocuments();
  if (recCount === 0) {
    await Recommendation.insertMany(seedRecommendations);
    console.log("Seeded recommendations collection");
  }

  // ── Users ─────────────────────────────────────────────────────
  for (const u of seedUsers) {
    const existing = await User.findOne({ email: u.email });
    if (!existing) {
      const hash = await argon2.hash(u.password);
      const created = await User.create({
        email:    u.email,
        password: hash,
        name:     u.name,
        role:     u.role,
        active:   true,
      });
      console.log(`Seeded user: ${u.email} (${u.role})`);
      await seedNotificationsFor(created._id);
    } else {
      // Ensure notifications exist for pre-existing seeded users
      await seedNotificationsFor(existing._id);
    }
  }
}
