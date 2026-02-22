/**
 * Settings routes — /api/settings
 *
 * GET  /api/settings/me            — fetch full settings for current user
 * PUT  /api/settings/account       — update name / department
 * PUT  /api/settings/notifications — update notification prefs
 * PUT  /api/settings/system        — update areas of interest / custom tags
 */

import { Router } from 'express';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const DEFAULT_SETTINGS = {
  department: '',
  notifications: {
    email: true, push: false, criticalAlerts: true,
    warnings: true, systemUpdates: false, maintenance: true,
  },
  system: { areasOfInterest: [], customTags: '' },
};

// ── GET /api/settings/me ──────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ settings: user.settings ?? DEFAULT_SETTINGS });
  } catch {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// ── PUT /api/settings/account ─────────────────────────────────
router.put('/account', authenticate, async (req, res) => {
  try {
    const { name, department } = req.body;
    const $set = {};
    if (name)                    $set.name = String(name).slice(0, 100);
    if (department !== undefined) $set['settings.department'] = String(department).slice(0, 100);
    await User.findByIdAndUpdate(req.user.userId, { $set });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to save account settings' });
  }
});

// ── PUT /api/settings/notifications ──────────────────────────
router.put('/notifications', authenticate, async (req, res) => {
  try {
    const { email, push, criticalAlerts, warnings, systemUpdates, maintenance } = req.body;
    const $set = {};
    for (const [k, v] of Object.entries({ email, push, criticalAlerts, warnings, systemUpdates, maintenance })) {
      if (typeof v === 'boolean') $set[`settings.notifications.${k}`] = v;
    }
    await User.findByIdAndUpdate(req.user.userId, { $set });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to save notification settings' });
  }
});

// ── PUT /api/settings/system ──────────────────────────────────
router.put('/system', authenticate, async (req, res) => {
  try {
    const { areasOfInterest, customTags } = req.body;
    const $set = {};
    if (Array.isArray(areasOfInterest)) $set['settings.system.areasOfInterest'] = areasOfInterest.slice(0, 20);
    if (typeof customTags === 'string')  $set['settings.system.customTags']      = customTags.slice(0, 500);
    await User.findByIdAndUpdate(req.user.userId, { $set });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to save system settings' });
  }
});

export default router;
