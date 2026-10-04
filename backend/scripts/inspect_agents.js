import { pool } from '../src/config/db.js';

async function main() {
  const ag = await pool.query('SELECT count(*) FROM agents');
  console.log('agents count:', ag.rows[0].count);
  const sp = await pool.query('SELECT count(*) FROM service_partners');
  console.log('service_partners count:', sp.rows[0].count);
  const al = await pool.query('SELECT count(*) FROM agent_login');
  console.log('agent_login count:', al.rows[0].count);

  if (ag.rows[0].count > 0) {
    const r = await pool.query('SELECT id, partner_id, name, email FROM agents LIMIT 5');
    console.log('agents samples:', r.rows);
  }
  if (sp.rows[0].count > 0) {
    const r = await pool.query('SELECT id, partner_id, name, email FROM service_partners LIMIT 5');
    console.log('service_partners samples:', r.rows);
  }

  await pool.end();
}

main().catch(console.error);
