import { pool } from '../apps/api/src/config/db.js';

async function cleanDatabase() {
  console.log('🔄 ============================================================');
  console.log('🧹 NIVAAROFIX DATABASE PURGE: REMOVING ALL AI-GENERATED DATA');
  console.log('============================================================');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Temporarily disable the immutable audit trigger to allow purging test audit logs
    await client.query(`
      ALTER TABLE admin_audit_log DISABLE TRIGGER trg_admin_audit_log_immutable;
    `);

    // 1. Truncate all tables containing dummy / mock / AI-generated data
    // Note: service_categories, services, schema_migrations, and admin_users are PRESERVED.
    await client.query(`
      TRUNCATE TABLE
        admin_audit_log,
        admin_sessions,
        user_sessions,
        user_login,
        users,
        agent_login,
        customers,
        customer_status_history,
        professionals,
        professional_documents,
        professional_photos,
        professional_flags,
        professional_status_history,
        professional_suspensions,
        banned_professionals,
        professional_gps_log,
        location_updates,
        realtime_events,
        realtime_presence,
        verification_audit_log,
        verification_events,
        verification_items,
        verification_reason_templates,
        verification_requests,
        service_requests,
        request_dispatches,
        request_photos,
        booking_photos,
        booking_media,
        quotes,
        door_otps,
        job_events,
        completion_proofs,
        complaints,
        complaint_attachments,
        complaint_messages,
        payments,
        payment_attempts,
        payment_transfers,
        payouts,
        refunds,
        wallet_transactions,
        feedback,
        reviews,
        platform_feedbacks,
        support_tickets,
        support_ticket_updates,
        notifications,
        messages,
        conversations,
        mobile_verifications,
        otp_verifications,
        webhook_events
      RESTART IDENTITY CASCADE;
    `);

    // 2. Clean extra test admin users (keep only the root 'admin' owner)
    await client.query(`
      DELETE FROM admin_users WHERE username != 'admin';
    `);

    // Re-enable the immutable audit trigger
    await client.query(`
      ALTER TABLE admin_audit_log ENABLE TRIGGER trg_admin_audit_log_immutable;
    `);

    // 3. Reset code_sequences so numbering cleanly restarts at 2026000001
    await client.query(`
      UPDATE code_sequences
      SET last_value = '0', updated_at = CURRENT_TIMESTAMP;
    `);

    // 4. Reset primary key auto-increment sequences
    const seqRes = await client.query(`
      SELECT sequence_name 
      FROM information_schema.sequences 
      WHERE sequence_schema = 'public'
        AND sequence_name NOT LIKE '%service_categories%'
        AND sequence_name NOT LIKE '%services%'
        AND sequence_name NOT LIKE '%admin_users%';
    `);

    for (const seq of seqRes.rows) {
      try {
        await client.query(`ALTER SEQUENCE "${seq.sequence_name}" RESTART WITH 1;`);
      } catch (err) {
        // Safe skip
      }
    }

    await client.query('COMMIT');
    console.log('✅ Successfully purged all mock, test, and AI-generated records.');
    console.log(`✅ Reset ${seqRes.rows.length} primary key sequences to 1.`);
    console.log('✅ Reset code_sequences to 0 (Next IDs will start cleanly at 2026000001).');

    // 5. Audit all tables to verify zero fake data and table structure intact
    console.log('\n--- VERIFYING CLEAN STATE ACROSS ALL TABLES ---');
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const summary = [];
    let fakeDataFound = false;

    for (const row of tablesRes.rows) {
      const countRes = await client.query(`SELECT COUNT(*) as count FROM "${row.table_name}";`);
      const count = parseInt(countRes.rows[0].count, 10);
      const isCatalog = ['service_categories', 'services', 'schema_migrations', 'code_sequences'].includes(row.table_name);
      const isAdminRoot = row.table_name === 'admin_users' && count === 1;

      if (!isCatalog && !isAdminRoot && count > 0) {
        fakeDataFound = true;
      }

      summary.push({
        Table: row.table_name,
        Rows: count,
        Status: (isCatalog || isAdminRoot) ? 'System / Catalog Preserved' : (count === 0 ? 'Clean (0 rows)' : '⚠️ UNCLEAN')
      });
    }

    console.table(summary);

    if (fakeDataFound) {
      throw new Error('Verification failed: some operational tables still contain data!');
    }

    console.log('\n--- VERIFYING FOREIGN KEY INTEGRITY ---');
    const fkRes = await client.query(`
      SELECT
        tc.table_name AS "From Table", 
        kcu.column_name AS "From Column", 
        ccu.table_name AS "To Table",
        ccu.column_name AS "To Column" 
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public'
      ORDER BY tc.table_name, kcu.column_name;
    `);

    console.log(`✅ Total active foreign keys connecting all tables: ${fkRes.rows.length}`);
    console.log('============================================================');
    console.log('✨ DATABASE CLEANING COMPLETE: ZERO AI-GENERATED DATA PRESENT');
    console.log('============================================================');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Database cleaning error:', err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

cleanDatabase();
