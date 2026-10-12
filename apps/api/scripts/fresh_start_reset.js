import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function freshStart() {
  console.log('🔄 ============================================================');
  console.log('🧹 NIVAAROFIX FRESH START: WIPING TRANSACTIONAL DATA');
  console.log('============================================================');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1. Truncating all transactional tables...');
    await client.query(`
      TRUNCATE TABLE
        job_events,
        booking_photos,
        booking_media,
        messages,
        conversations,
        payments,
        reviews,
        wallet_transactions,
        quotes,
        request_dispatches,
        bookings,
        service_requests,
        professional_gps_log
      RESTART IDENTITY CASCADE;
    `);

    // Clean up media_files associated with bookings or requests
    await client.query(`
      DELETE FROM media_files 
      WHERE entity_type IN ('booking', 'service_request', 'quote', 'problem_photo', 'completion_photo');
    `);

    console.log('2. Creating / resetting numeric sequence for service requests...');
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS service_request_numeric_seq START WITH 1 INCREMENT BY 1;
      ALTER SEQUENCE service_request_numeric_seq RESTART WITH 1;
    `);

    console.log('3. Resetting sequences for transactional tables...');
    const seqNames = [
      'service_requests_id_seq',
      'bookings_id_seq',
      'quotes_id_seq',
      'job_events_id_seq',
      'booking_photos_id_seq',
      'booking_media_id_seq',
      'request_dispatches_id_seq',
      'conversations_id_seq',
      'messages_id_seq',
      'wallet_transactions_id_seq',
      'payments_id_seq',
      'reviews_id_seq',
      'professional_gps_log_id_seq'
    ];
    for (const seq of seqNames) {
      try {
        await client.query(`ALTER SEQUENCE ${seq} RESTART WITH 1;`);
      } catch (err) {
        // sequence may not exist or have different name
      }
    }

    console.log('4. Resetting professional balances, ratings, job counts, and availability...');
    await client.query(`
      UPDATE agent_login
      SET wallet_balance = 0.00,
          rating = NULL,
          completed_jobs = 0,
          availability_status = 'AVAILABLE',
          is_online = true;
    `);

    await client.query(`
      UPDATE professionals
      SET wallet_balance = 0.00,
          rating = NULL,
          completed_jobs = 0,
          total_reviews = 0,
          availability_status = 'available',
          is_online = true;
    `);

    await client.query(`
      UPDATE professional_wallets
      SET balance = 0.00,
          total_earned = 0.00,
          total_withdrawn = 0.00,
          pending_payout = 0.00;
    `);

    await client.query('COMMIT');
    console.log('   ✅ Database transaction committed successfully.');

    console.log('5. Cleaning uploaded files in backend/uploads/booking_photos...');
    const uploadDir = path.join(__dirname, '../uploads/booking_photos');
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      for (const file of files) {
        if (file !== '.gitkeep') {
          fs.unlinkSync(path.join(uploadDir, file));
          console.log(`   Deleted photo: ${file}`);
        }
      }
    }

    console.log('6. Verifying database state:');
    const transactionalTables = [
      'service_requests',
      'quotes',
      'bookings',
      'job_events',
      'booking_photos',
      'booking_media',
      'request_dispatches',
      'conversations',
      'messages',
      'wallet_transactions',
      'payments',
      'reviews',
      'professional_gps_log'
    ];

    const report = [];
    for (const t of transactionalTables) {
      const res = await client.query(`SELECT COUNT(*) as count FROM ${t}`);
      report.push({
        Table: t,
        Rows: parseInt(res.rows[0].count, 10),
        Status: parseInt(res.rows[0].count, 10) === 0 ? 'CLEAN (0)' : 'NON-ZERO!'
      });
    }
    console.table(report);

    const userCount = await client.query('SELECT COUNT(*) FROM user_login');
    const custCount = await client.query('SELECT COUNT(*) FROM customers');
    const agentCount = await client.query('SELECT COUNT(*) FROM agent_login');
    const proCount = await client.query('SELECT COUNT(*) FROM professionals');

    console.log('Account preservation check:');
    console.log(`- user_login: ${userCount.rows[0].count} accounts`);
    console.log(`- customers: ${custCount.rows[0].count} accounts`);
    console.log(`- agent_login: ${agentCount.rows[0].count} accounts`);
    console.log(`- professionals: ${proCount.rows[0].count} accounts`);

    console.log('============================================================');
    console.log('✨ FRESH START PURGE COMPLETED SUCCESSFULLY!');
    console.log('============================================================');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Fresh start failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

freshStart();
