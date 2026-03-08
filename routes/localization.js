/**
 * Public localization endpoint — no auth required.
 * Returns active translation keys as a flat key→value map.
 * Used by frontend pages to load translations at runtime.
 */
import { Router } from 'express';
import LandingKey from '../models/LandingKey.js';

const router = Router();

// GET /api/localization?page=landing&language=en
// Returns { translations: { 'hero.title': '...', ... } }
router.get('/', async (req, res) => {
  try {
    const { page = 'landing', language = 'en' } = req.query;

    const keys = await LandingKey.find({
      page:     page.toLowerCase(),
      language: language.toLowerCase(),
      status:   'active',
    }).select('key value -_id').lean();

    const translations = Object.fromEntries(keys.map(k => [k.key, k.value]));

    res.json({ translations, page, language, total: keys.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
