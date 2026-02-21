/**
 * Notification routes — /api/notifications
 *
 * GET   /api/notifications/unread-count   → { unreadCount }
 * PATCH /api/notifications/read-all       → marks every unread notification read for the user
 * PATCH /api/notifications/:id/read       → marks one notification read
 *
 * After any read mutation, pushes `notifications:count` via WebSocket to the user.
 */

import { Router } from 'express';
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import { authenticate } from '../middleware/auth.js';
import { sendToUser } from '../utils/websocket.js';

const router = Router();

// ── In-memory store for demo users ───────────────────────────
// Populated by initDemoNotifications() called from seed.js
export const demoStore = new Map(); // userId → Notification[]

export function initDemoNotifications() {
  const seed = [
    { id: 'n1', title: 'Temperature Critical',    message: 'Machine A1 temperature exceeded 80°C',          type: 'critical', read: false, createdAt: new Date(Date.now() - 5 * 60000)  },
    { id: 'n2', title: 'Pressure Warning',         message: 'Pressure System approaching upper control limit', type: 'warning',  read: false, createdAt: new Date(Date.now() - 20 * 60000) },
    { id: 'n3', title: 'Maintenance Due',          message: 'Machine B3 maintenance window in next 48 hours',  type: 'info',     read: false, createdAt: new Date(Date.now() - 60 * 60000) },
  ];

  for (const uid of ['demo-admin-001', 'demo-user-001']) {
    if (!demoStore.has(uid)) {
      demoStore.set(uid, seed.map(n => ({ ...n, userId: uid })));
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────
function isDemoId(id) { return typeof id === 'string' && id.startsWith('demo-'); }

function demoUnreadCount(userId) {
  return (demoStore.get(userId) || []).filter(n => !n.read).length;
}

function pushCount(userId, count) {
  sendToUser(userId, { type: 'notifications:count', data: { unreadCount: count } });
}

// ── GET /api/notifications — list (most recent 20) ───────────
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.userId;

  if (isDemoId(userId)) {
    const notes = (demoStore.get(userId) || []).slice().reverse();
    return res.json({ notifications: notes });
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ notifications: [] });
    }
    const notifications = await Notification
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// ── GET /api/notifications/unread-count ───────────────────────
router.get('/unread-count', authenticate, async (req, res) => {
  const userId = req.user.userId;

  if (isDemoId(userId)) {
    return res.json({ unreadCount: demoUnreadCount(userId) });
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ unreadCount: 0 });
    }
    const unreadCount = await Notification.countDocuments({ userId, read: false });
    res.json({ unreadCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// ── PATCH /api/notifications/read-all ─────────────────────────
// Must be registered BEFORE /:id/read so it isn't captured as an id
router.patch('/read-all', authenticate, async (req, res) => {
  const userId = req.user.userId;

  if (isDemoId(userId)) {
    const notes = demoStore.get(userId) || [];
    notes.forEach(n => { n.read = true; });
    pushCount(userId, 0);
    return res.json({ ok: true, unreadCount: 0 });
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ ok: true, unreadCount: 0 });
    }
    await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
    pushCount(userId, 0);
    res.json({ ok: true, unreadCount: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// ── PATCH /api/notifications/:id/read ────────────────────────
router.patch('/:id/read', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { id }  = req.params;

  if (isDemoId(userId)) {
    const notes = demoStore.get(userId) || [];
    const note  = notes.find(n => n.id === id);
    if (note) note.read = true;
    const count = demoUnreadCount(userId);
    pushCount(userId, count);
    return res.json({ ok: true, unreadCount: count });
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ ok: true, unreadCount: 0 });
    }
    await Notification.findOneAndUpdate({ _id: id, userId }, { $set: { read: true } });
    const count = await Notification.countDocuments({ userId, read: false });
    pushCount(userId, count);
    res.json({ ok: true, unreadCount: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;
