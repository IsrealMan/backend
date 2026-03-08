import { Router } from 'express';
import { z } from 'zod';
import LandingKey from '../../models/LandingKey.js';
import { authenticate, authorize } from '../../middleware/auth.js';

const router = Router();

router.use(authenticate, authorize('admin'));

// ── Validation ─────────────────────────────────────────────────
const createSchema = z.object({
  page:     z.string().min(1).max(100).trim().toLowerCase().default('landing'),
  key:      z.string().min(1).max(200).trim(),
  section:  z.string().min(1).max(100).trim().toLowerCase(),
  language: z.string().min(2).max(10).trim().toLowerCase(),
  value:    z.string().min(1),
  status:   z.enum(['active', 'inactive']).default('active'),
});

const updateSchema = z.object({
  value:   z.string().min(1).optional(),
  status:  z.enum(['active', 'inactive']).optional(),
  key:     z.string().min(1).max(200).trim().optional(),
  section: z.string().min(1).max(100).trim().toLowerCase().optional(),
  page:    z.string().min(1).max(100).trim().toLowerCase().optional(),
}).strict();

// ── GET / — list with filters, grouped by section ──────────────
router.get('/', async (req, res) => {
  try {
    const { page, language, section, search, status } = req.query;

    const filter = {};
    if (page)     filter.page     = page.toLowerCase();
    if (language) filter.language = language.toLowerCase();
    if (section)  filter.section  = section.toLowerCase();
    if (status)   filter.status   = status;
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [{ key: re }, { value: re }];
    }

    const keys = await LandingKey.find(filter).sort({ section: 1, key: 1 }).lean();

    // Group by section
    const grouped = keys.reduce((acc, k) => {
      if (!acc[k.section]) acc[k.section] = [];
      acc[k.section].push(k);
      return acc;
    }, {});

    const languages = await LandingKey.distinct('language', page ? { page: page.toLowerCase() } : {});
    const pages     = await LandingKey.distinct('page');

    res.json({ keys, grouped, languages, pages, total: keys.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /sections ───────────────────────────────────────────────
router.get('/sections', async (req, res) => {
  try {
    const filter = req.query.page ? { page: req.query.page.toLowerCase() } : {};
    const sections = await LandingKey.distinct('section', filter);
    res.json({ sections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST / — create ────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const data = createSchema.parse(req.body);
    const doc = await LandingKey.create(data);
    res.status(201).json(doc);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Key already exists for this page, language and section' });
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /:id — update ──────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const data = updateSchema.parse(req.body);
    const doc = await LandingKey.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Key not found' });
    res.json(doc);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Key already exists for this page, language and section' });
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /:id/status ──────────────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = z.object({ status: z.enum(['active', 'inactive']) }).parse(req.body);
    const doc = await LandingKey.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Key not found' });
    res.json(doc);
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /:id ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const doc = await LandingKey.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Key not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
