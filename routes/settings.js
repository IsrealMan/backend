/**
 * Settings routes — /api/settings
 *
 * GET  /api/settings/me           — fetch full settings for current user
 * PUT  /api/settings/account      — update name / department
 * PUT  /api/settings/notifications — update notification prefs
 * PUT  /api/settings/system       — update areas of interest / custom tags
 */

import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ── In-memory settings store for demo users (no DB) ──────────
const demoSettings = new Map();

const DEFAULT_SETTINGS = {
  department: '',
  notifications: {
    email: true,
    push: false,
    criticalAlerts: true,
    warnings: true,
    systemUpdates: false,
    maintenance: true,
  },
  system: {
    areasOfInterest: [],
    customTags: '',
  },
};

function getDemoSettings(userId) {
  if (!demoSettings.has(userId)) {
    demoSettings.set(userId, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  }
  return demoSettings.get(userId);
}

// Helper — is this a demo user id?
function isDemoId(id) {
  return typeof id === 'string' && id.startsWith('demo-');
}

// ── GET /api/settings/me ─────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    if (isDemoId(userId)) {
      return res.json({ settings: getDemoSettings(userId) });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.json({ settings: DEFAULT_SETTINGS });
    }

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ settings: user.settings ?? DEFAULT_SETTINGS });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// ── PUT /api/settings/account ────────────────────────────────
router.put('/account', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, department } = req.body;

    if (isDemoId(userId)) {
      const s = getDemoSettings(userId);
      if (department !== undefined) s.department = String(department).slice(0, 100);
      return res.json({ ok: true });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.json({ ok: true });
    }

    const update = {};
    if (name)       update.name = String(name).slice(0, 100);
    if (department !== undefined) update['settings.department'] = String(department).slice(0, 100);

    await User.findByIdAndUpdate(userId, { $set: update });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save account settings' });
  }
});

// ── PUT /api/settings/notifications ─────────────────────────
router.put('/notifications', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { email, push, criticalAlerts, warnings, systemUpdates, maintenance } = req.body;

    const patch = {};
    for (const [k, v] of Object.entries({ email, push, criticalAlerts, warnings, systemUpdates, maintenance })) {
      if (typeof v === 'boolean') patch[k] = v;
    }

    if (isDemoId(userId)) {
      const s = getDemoSettings(userId);
      Object.assign(s.notifications, patch);
      return res.json({ ok: true });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.json({ ok: true });
    }

    const mongoUpdate = {};
    for (const [k, v] of Object.entries(patch)) {
      mongoUpdate[`settings.notifications.${k}`] = v;
    }
    await User.findByIdAndUpdate(userId, { $set: mongoUpdate });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save notification settings' });
  }
});

// ── PUT /api/settings/system ──────────────────────────────────
router.put('/system', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { areasOfInterest, customTags } = req.body;

    if (isDemoId(userId)) {
      const s = getDemoSettings(userId);
      if (Array.isArray(areasOfInterest)) s.system.areasOfInterest = areasOfInterest.slice(0, 20);
      if (typeof customTags === 'string')  s.system.customTags = customTags.slice(0, 500);
      return res.json({ ok: true });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.json({ ok: true });
    }

    const update = {};
    if (Array.isArray(areasOfInterest)) update['settings.system.areasOfInterest'] = areasOfInterest.slice(0, 20);
    if (typeof customTags === 'string')  update['settings.system.customTags'] = customTags.slice(0, 500);

    await User.findByIdAndUpdate(userId, { $set: update });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save system settings' });
  }
});

export default router;
