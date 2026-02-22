import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import { authenticate, authorize } from '../../middleware/auth.js';

const router = Router();

// All routes in this file require an authenticated admin
router.use(authenticate, authorize('admin'));

// ── Validation schemas ─────────────────────────────────────────
const createSchema = z.object({
  name:     z.string().min(1).max(100),
  email:    z.string().email().transform(s => s.toLowerCase()),
  password: z.string().min(8),
  role:     z.enum(['user', 'admin', 'operator']).default('user'),
});

const updateSchema = z.object({
  name:       z.string().min(1).max(100).optional(),
  email:      z.string().email().transform(s => s.toLowerCase()).optional(),
  role:       z.enum(['user', 'admin', 'operator']).optional(),
  department: z.string().max(100).optional(),
}).strict();

const roleSchema   = z.object({ role:   z.enum(['user', 'admin', 'operator']) });
const statusSchema = z.object({ active: z.boolean() });

// ── Helpers ───────────────────────────────────────────────────
const SAFE = '-password -refreshTokens';

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalize(u) {
  const obj = typeof u.toJSON === 'function' ? u.toJSON() : u;
  return { ...obj, active: obj.active !== false };
}

const SORT_ALLOW = new Set(['name', 'email', 'role', 'createdAt']);

// ── GET /  ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const {
    search = '', role, status,
    page = 1, limit = 20,
    sort = 'createdAt', order = 'desc',
  } = req.query;

  const filter = {};
  if (search.trim()) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  if (role && ['user', 'admin', 'operator'].includes(role)) filter.role = role;
  if (status === 'active')   filter.active = { $ne: false };
  if (status === 'inactive') filter.active = false;

  const pageNum  = Math.max(1, parseInt(page)  || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const skip     = (pageNum - 1) * limitNum;
  const sortField = SORT_ALLOW.has(sort) ? sort : 'createdAt';
  const sortDir   = order === 'asc' ? 1 : -1;

  const [users, total] = await Promise.all([
    User.find(filter).select(SAFE).sort({ [sortField]: sortDir }).skip(skip).limit(limitNum).lean(),
    User.countDocuments(filter),
  ]);

  res.json({
    users: users.map(normalize),
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  });
});

// ── GET /:id  ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const user = await User.findById(req.params.id).select(SAFE).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(normalize(user));
});

// ── POST /  (create) ─────────────────────────────────────────
router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { name, email, password, role } = parsed.data;

  if (await User.exists({ email }))
    return res.status(409).json({ error: 'Email already in use' });

  const hash = await argon2.hash(password);
  const user = await User.create({ name, email, password: hash, role, active: true });
  res.status(201).json(normalize(user));
});

// ── PUT /:id  (update) ────────────────────────────────────────
router.put('/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { name, email, role, department } = parsed.data;
  const $set = {};

  if (name  !== undefined) $set.name  = name;
  if (role  !== undefined) $set.role  = role;
  if (department !== undefined) $set['settings.department'] = department;
  if (email !== undefined) {
    const clash = await User.exists({ email, _id: { $ne: req.params.id } });
    if (clash) return res.status(409).json({ error: 'Email already in use' });
    $set.email = email;
  }

  if (!Object.keys($set).length) return res.status(400).json({ error: 'No fields to update' });

  const user = await User.findByIdAndUpdate(
    req.params.id, { $set }, { new: true, runValidators: true }
  ).select(SAFE);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(normalize(user));
});

// ── PATCH /:id/status  ────────────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  if (req.params.id === req.user.userId)
    return res.status(400).json({ error: 'Cannot change your own status' });

  const $set = { active: parsed.data.active };
  // Revoke all sessions when disabling
  if (!parsed.data.active) $set.refreshTokens = [];

  const user = await User.findByIdAndUpdate(req.params.id, { $set }, { new: true }).select(SAFE);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(normalize(user));
});

// ── PATCH /:id/roles  ─────────────────────────────────────────
router.patch('/:id/roles', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  if (req.params.id === req.user.userId)
    return res.status(400).json({ error: 'Cannot change your own role' });

  const user = await User.findByIdAndUpdate(
    req.params.id, { $set: { role: parsed.data.role } }, { new: true }
  ).select(SAFE);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(normalize(user));
});

// ── POST /:id/reset-password  ─────────────────────────────────
router.post('/:id/reset-password', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });

  const chars   = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  const tempPass = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const hash     = await argon2.hash(tempPass);

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $set: { password: hash, refreshTokens: [] } },
    { new: true }
  ).select(SAFE);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({ tempPassword: tempPass, message: 'Password reset. Share with user securely.' });
});

export default router;
