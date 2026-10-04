import { pool } from '../config/db.js';

const r = await pool.query(`
  SELECT 
    t.table_name,
    t.table_type,
    (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS columns
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
  ORDER BY t.table_type DESC, t.table_name
`);
console.table(r.rows);
await pool.end();
