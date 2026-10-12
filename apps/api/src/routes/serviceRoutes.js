import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

// Get all services from PostgreSQL
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = 'SELECT * FROM services WHERE 1=1';
    const params = [];

    if (category && category !== 'all') {
      params.push(category);
      query += ` AND category_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (title ILIKE $${params.length} OR short_desc ILIKE $${params.length})`;
    }

    query += ' ORDER BY is_popular DESC, starting_price ASC';

    const result = await pool.query(query, params);
    res.json({
      success: true,
      count: result.rows.length,
      services: result.rows
    });
  } catch (err) {
    console.error('Fetch services error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get service by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    res.json({ success: true, service: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
