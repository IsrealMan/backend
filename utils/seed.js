import argon2 from "argon2";
import Alert from "../models/Alert.js";
import Recommendation from "../models/Recommendation.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import LandingKey from "../models/LandingKey.js";

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

// ── Landing page default translations (English) ───────────────
const landingKeysEn = [
  // hero
  { key: 'hero.badge',    section: 'hero',     value: 'AI-Powered Predictive Maintenance for Manufacturing' },
  { key: 'hero.title',    section: 'hero',     value: 'PredixaAI enables manufacturers to predict and prevent unexpected downtime' },
  { key: 'hero.subtitle', section: 'hero',     value: 'Transform your manufacturing operations with AI that sees problems before they happen — saving millions in lost production.' },
  { key: 'hero.cta_primary',   section: 'hero', value: 'Request a Demo' },
  { key: 'hero.cta_secondary', section: 'hero', value: 'Customer Login' },
  // problem
  { key: 'problem.badge', section: 'problem',  value: 'The Problem' },
  { key: 'problem.title', section: 'problem',  value: 'The Hidden Cost of Downtime' },
  { key: 'problem.body',  section: 'problem',  value: "Unplanned downtime costs the world's top 500 companies $1.4 trillion annually — over 11% of total revenue." },
  // solution
  { key: 'solution.badge', section: 'solution', value: 'The Solution' },
  { key: 'solution.title', section: 'solution', value: 'AI That Prevents Downtime' },
  { key: 'solution.body',  section: 'solution', value: 'PredixaAI is an AI-driven platform that transforms manufacturing operations by proactively predicting and preventing process anomalies that cause downtime. Our platform learns from your production data in real time, identifying patterns invisible to human operators, and delivers actionable insights before issues escalate.' },
  // capabilities
  { key: 'capabilities.badge', section: 'features', value: 'Platform' },
  { key: 'capabilities.title', section: 'features', value: 'Capabilities' },
  // benefits
  { key: 'benefits.badge', section: 'features', value: 'Why PredixaAI' },
  { key: 'benefits.title', section: 'features', value: 'Benefits' },
  // cta
  { key: 'cta.title',    section: 'cta', value: 'Ready to eliminate unplanned downtime?' },
  { key: 'cta.subtitle', section: 'cta', value: 'Join leading manufacturers who trust PredixaAI to keep their operations running — and their revenue growing.' },
  { key: 'cta.primary',   section: 'cta', value: 'Request a Demo' },
  { key: 'cta.secondary', section: 'cta', value: 'Customer Login' },
  // footer
  { key: 'footer.tagline', section: 'footer', value: 'AI-driven predictive maintenance for modern manufacturers. Predict. Prevent. Prosper.' },
  { key: 'footer.copyright', section: 'footer', value: 'All rights reserved.' },
  // nav
  { key: 'nav.login', section: 'nav', value: 'Login' },
  { key: 'nav.cta',   section: 'nav', value: 'Request a Demo' },
];

export async function seedDatabase() {
  // ── Landing page localization keys ────────────────────────────
  const keyCount = await LandingKey.countDocuments({ page: 'landing', language: 'en' });
  if (keyCount === 0) {
    const docs = landingKeysEn.map(k => ({ ...k, page: 'landing', language: 'en', status: 'active' }));
    await LandingKey.insertMany(docs, { ordered: false }).catch(() => {});
    console.log("Seeded landing page localization keys (en)");
  }
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
