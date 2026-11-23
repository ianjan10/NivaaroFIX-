import express from 'express';
import crypto from 'crypto';
import { pool } from '../config/db.js';

const router = express.Router();

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function formatMonthYear(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return null;
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * GET /api/public/feedback
 * Read-only public feed returning published customer appreciations for the homepage.
 * Strictly whitelisted fields only. No PII, emails, phones, customer IDs, or internal notes.
 */
router.get('/public/feedback', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pf.id,
        COALESCE(pf.public_text, pf.comment) AS public_text,
        COALESCE(pf.public_name, 'Customer') AS public_name,
        pf.rating
      FROM platform_feedbacks pf
      WHERE pf.is_published = TRUE
      ORDER BY pf.published_at DESC NULLS LAST, pf.id DESC
      LIMIT 8;
    `);

    // Whitelist strictly: exactly id, publicText, publicName, rating (nullable)
    const items = result.rows.map((row) => ({
      id: parseInt(row.id, 10),
      publicText: String(row.public_text || '').slice(0, 280),
      publicName: String(row.public_name || 'Customer').slice(0, 40),
      rating: typeof row.rating === 'number' && row.rating >= 1 && row.rating <= 5 ? row.rating : null
    }));

    const responseBody = JSON.stringify({
      success: true,
      testimonials: items
    });

    // ETag + Cache-Control: max-age 60s, must-revalidate
    const etag = `"${crypto.createHash('md5').update(responseBody).digest('hex')}"`;
    res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
    res.setHeader('ETag', etag);

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(responseBody);
  } catch (err) {
    console.error('Fetch public feedback error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve feedback.' });
  }
});

// Alias for flexibility
router.get('/feedback/public', (req, res) => {
  req.url = '/public/feedback';
  router.handle(req, res);
});

export default router;

