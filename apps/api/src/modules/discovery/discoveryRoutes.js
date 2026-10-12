import { Router } from 'express';
import { resolveServiceSearch } from './searchService.js';
import { pool } from '../../config/db.js';

const router = Router();

// GET /api/discovery/search?q=
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const result = await resolveServiceSearch(q);
    return res.json({
      success: true,
      data: result,
      requestId: `req_${Date.now()}`
    });
  } catch (error) {
    console.error('Error in /api/discovery/search:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SEARCH_ERROR',
        message: 'Unable to process search discovery query.'
      }
    });
  }
});

// GET /api/discovery/categories
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM service_categories 
      WHERE is_active = true 
      ORDER BY id ASC;
    `);
    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error in /api/discovery/categories:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'CATEGORIES_FETCH_ERROR',
        message: 'Failed to retrieve service categories.'
      }
    });
  }
});

export default router;
