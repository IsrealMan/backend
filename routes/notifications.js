/**
 * Notification routes — /api/notifications
 *
 * GET   /api/notifications              → list (most recent 20)
 * GET   /api/notifications/unread-count → { unreadCount }
 * PATCH /api/notifications/read-all     → mark all read for current user
 * PATCH /api/notifications/:id/read     → mark one notification read
 */

import { Router } from 'express';
import Notification from '../models/Notification.js';
import { authenticate } from '../middleware/auth.js';
import { sendToUser } from '../utils/websocket.js';

const router = Router();

function pushCount(userId, count) {
  sendToUser(userId, { type: 'notifications:count', data: { unreadCount: count } });
}

// ── GET / — list ──────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const notifications = await Notification
      .find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ notifications });
  } catch {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// ── GET /unread-count ─────────────────────────────────────────
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({ userId: req.user.userId, read: false });
    res.json({ unreadCount });
  } catch {
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// ── PATCH /read-all  (must be before /:id/read) ───────────────
router.patch('/read-all', authenticate, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.userId, read: false }, { $set: { read: true } });
    pushCount(req.user.userId, 0);
    res.json({ ok: true, unreadCount: 0 });
  } catch {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// ── PATCH /:id/read ───────────────────────────────────────────
router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { $set: { read: true } }
    );
    const count = await Notification.countDocuments({ userId: req.user.userId, read: false });
    pushCount(req.user.userId, count);
    res.json({ ok: true, unreadCount: count });
  } catch {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;
