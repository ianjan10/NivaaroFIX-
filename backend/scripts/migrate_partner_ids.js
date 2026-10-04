import { pool } from '../src/config/db.js';

async function migratePartnerIds() {
  console.log('🔄 Starting migration of agent_login partner_id to 9-digit format (YYYYXXXXX)...');

  // Select all agents ordered by registration time / id
  const res = await pool.query(`
    SELECT id, partner_id, name, email, created_at 
    FROM agent_login 
    ORDER BY created_at ASC, id ASC;
  `);

  console.log(`Found ${res.rows.length} records in agent_login.`);
  
  // Track sequence per year
  const seqPerYear = {};

  // First, find existing valid 9-digit IDs to not collide
  for (const row of res.rows) {
    if (row.partner_id && /^[0-9]{9}$/.test(row.partner_id)) {
      const year = row.partner_id.slice(0, 4);
      const seq = parseInt(row.partner_id.slice(4), 10);
      if (!seqPerYear[year] || seq > seqPerYear[year]) {
        seqPerYear[year] = seq;
      }
    }
  }

  // Now assign 9-digit IDs to any row that doesn't have a valid 9-digit ID
  let migratedCount = 0;
  for (const row of res.rows) {
    if (!row.partner_id || !/^[0-9]{9}$/.test(row.partner_id)) {
      const year = row.created_at ? new Date(row.created_at).getFullYear() : 2026;
      const yearStr = String(year);
      seqPerYear[yearStr] = (seqPerYear[yearStr] || 0) + 1;
      const newPartnerId = `${yearStr}${String(seqPerYear[yearStr]).padStart(5, '0')}`;

      console.log(`Migrating Agent [id=${row.id}, name="${row.name}", email="${row.email}"]: ${row.partner_id} -> ${newPartnerId}`);

      await pool.query(
        'UPDATE agent_login SET partner_id = $1 WHERE id = $2',
        [newPartnerId, row.id]
      );
      migratedCount++;
    } else {
      console.log(`Keeping existing valid 9-digit ID for Agent [id=${row.id}, name="${row.name}"]: ${row.partner_id}`);
    }
  }

  console.log(`\n✅ Migration complete! Successfully updated ${migratedCount} records to 9-digit format.`);

  // Verify the final table
  const check = await pool.query('SELECT id, partner_id, name, email FROM agent_login ORDER BY id ASC;');
  console.log('\nFinal agent_login records:');
  console.table(check.rows);

  await pool.end();
}

migratePartnerIds().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
