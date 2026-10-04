import { pool } from '../src/config/db.js';

async function main() {
  const res = await pool.query(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND (column_name LIKE '%partner%' OR column_name LIKE '%agent%')
  `);
  console.log(res.rows);
  await pool.end();
}

main().catch(console.error);
