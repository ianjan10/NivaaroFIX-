import { pool } from '../apps/api/src/config/db.js';
import fs from 'fs';
import path from 'path';

async function cleanupAllData() {
  console.log('================================================================');
  console.log('🧹 NIVAAROFIX TOTAL DATA PURGE (PRESERVING SCHEMAS & TABLES)');
  console.log('================================================================\n');

  const client = await pool.connect();
  try {
    const REFERENCE_TABLES = new Set([
      'service_categories',
      'services',
      'schema_migrations'
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

    console.log(`1. Purging all entries from ${tablesToPurge.length} data tables...`);

    // Truncate cascade in a transaction
    await client.query('BEGIN');

    for (const tbl of tablesToPurge) {
      try {
        await client.query(`TRUNCATE TABLE "${tbl}" RESTART IDENTITY CASCADE;`);
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
      } catch (_) {
        // Ignored
      }
    }

    await client.query('COMMIT');
    console.log('✅ All entries removed and sequences reset to 1!\n');

    // 3. Clean up physical encrypted storage
    const storageDir = path.resolve('storage/secure_documents');
    if (fs.existsSync(storageDir)) {
      const files = fs.readdirSync(storageDir);
      let deletedCount = 0;
      for (const f of files) {
        const fullPath = path.join(storageDir, f);
        if (fs.statSync(fullPath).isFile()) {
          fs.unlinkSync(fullPath);
          deletedCount++;
        }
      }
      console.log(`3. Cleaned physical storage (${deletedCount} encrypted document files purged from storage/secure_documents).\n`);
    }

    // 4. Verification Table Summary
    console.log('4. Auditing Database Tables & Row Counts:');
    const verifyRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    let nonRefRowsTotal = 0;
    const report = [];

    for (const row of verifyRes.rows) {
      const t = row.table_name;
      const countRes = await client.query(`SELECT COUNT(*) FROM "${t}";`);
      const count = parseInt(countRes.rows[0].count, 10);
      const isRef = REFERENCE_TABLES.has(t);
      if (!isRef && t !== 'code_sequences') {
        nonRefRowsTotal += count;
      }
      report.push({
        Table: t,
        Rows: count,
        Status: isRef 
          ? `CATALOG PRESERVED (${count} rows)` 
          : t === 'code_sequences' 
            ? 'INITIALIZED (0)' 
            : count === 0 
              ? 'CLEAN (0 rows)' 
              : `STILL HAS ${count} ROWS`
      });
    }

    console.table(report);

    console.log('================================================================');
    if (nonRefRowsTotal === 0) {
      console.log('🎉 SUCCESS: All admin, professional, customer, booking & audit entries are 100% PURGED!');
      console.log('All schemas, tables, constraints, foreign keys, triggers, and catalog data REMAIN INTACT.');
    } else {
      console.error(`⚠️ WARNING: ${nonRefRowsTotal} lingering rows found.`);
    }
    console.log('================================================================\n');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Data purge failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupAllData();

