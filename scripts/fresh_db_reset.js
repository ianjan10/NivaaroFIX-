import { pool } from '../apps/api/src/config/db.js';

async function freshDbReset() {
  console.log('================================================================');
  console.log('🧹 NIVAAROFIX TOTAL DATABASE CLEAN & PURGE');
  console.log('================================================================\n');

  const client = await pool.connect();
  try {
    const REFERENCE_TABLES = new Set([
      'service_categories',
      'services'
    ]);

    // 1. Fetch all base tables in public schema
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tablesToPurge = tableRes.rows
      .map(r => r.table_name)
      .filter(t => !REFERENCE_TABLES.has(t) && t !== 'code_sequences');

    console.log(`1. Purging ${tablesToPurge.length} non-reference tables...`);
    
    // Disable triggers temporarily or truncate cascade
    for (const tbl of tablesToPurge) {
      try {
        await client.query(`TRUNCATE TABLE "${tbl}" CASCADE;`);
      } catch (e) {
        try {
          await client.query(`DELETE FROM "${tbl}";`);
        } catch (err2) {
          console.warn(`   Notice on table ${tbl}:`, err2.message);
        }
      }
    }

    console.log('2. Resetting sequence generator numbers to zero...');
    await client.query(`
      DELETE FROM code_sequences;
      INSERT INTO code_sequences (entity, year, last_value)
      VALUES 
        ('service_request', EXTRACT(YEAR FROM CURRENT_DATE)::INT, 0),
        ('customer', EXTRACT(YEAR FROM CURRENT_DATE)::INT, 0),
        ('professional', EXTRACT(YEAR FROM CURRENT_DATE)::INT, 0);
    `);

    // Reset all identity sequences in public schema
    const seqRes = await client.query(`
      SELECT sequence_name 
      FROM information_schema.sequences 
      WHERE sequence_schema = 'public';
    `);

    for (const s of seqRes.rows) {
      try {
        await client.query(`ALTER SEQUENCE "${s.sequence_name}" RESTART WITH 1;`);
      } catch (e) {
        // Ignored
      }
    }

    for (const tbl of tablesToPurge) {
      try {
        await client.query(`ALTER TABLE "${tbl}" RESTART WITH 1;`);
      } catch (e) {
        // Ignored if not identity
      }
    }

    console.log('✅ Database purged and all sequences reset to 1!\n');

    console.log('3. Table Verification Summary in nivaarofix_db:');
    const verifyRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    let nonRefRowsTotal = 0;
    for (const row of verifyRes.rows) {
      const t = row.table_name;
      const countRes = await client.query(`SELECT COUNT(*) FROM "${t}";`);
      const count = parseInt(countRes.rows[0].count, 10);
      const isRef = REFERENCE_TABLES.has(t);
      if (!isRef && t !== 'code_sequences') {
        nonRefRowsTotal += count;
      }
      const statusLabel = isRef 
        ? `REFERENCE CATALOG (${count} rows)`
        : t === 'code_sequences'
          ? `SEQUENCE TRACKER (${count} rows)`
          : count === 0
            ? '0 rows (COMPLETELY CLEAN)'
            : `WARNING: ${count} rows!`;
      console.log(`  • ${t.padEnd(28)}: ${statusLabel}`);
    }

    console.log(`\n================================================================`);
    if (nonRefRowsTotal === 0) {
      console.log('🎉 SUCCESS: All user, agent, and transactional tables are 100% EMPTY!');
    } else {
      console.error(`❌ WARNING: Found ${nonRefRowsTotal} lingering rows across tables.`);
    }
    console.log('================================================================\n');

  } catch (err) {
    console.error('Purge error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

freshDbReset();
