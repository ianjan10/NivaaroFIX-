import { pool, initDatabase } from '../config/db.js';

/**
 * NivaaroFix — PostgreSQL Database Cleaner & Reset Script
 * Drops all old tables/views with CASCADE and recreates clean, professional tables.
 */
async function resetDatabase() {
  console.log('🔄 ==============================================');
  console.log('🧹 NIVAAROFIX DATABASE CLEANER & SCHEMA CREATOR');
  console.log('==============================================');

  const client = await pool.connect();
  try {
    console.log('1. Dropping existing tables and views (CASCADE)...');
    await client.query(`
      DROP VIEW IF EXISTS users CASCADE;
      DROP VIEW IF EXISTS agents CASCADE;
      DROP VIEW IF EXISTS customer_users CASCADE;
      DROP VIEW IF EXISTS service_partners CASCADE;
      DROP TABLE IF EXISTS reviews CASCADE;
      DROP TABLE IF EXISTS payments CASCADE;
      DROP TABLE IF EXISTS job_events CASCADE;
      DROP TABLE IF EXISTS request_dispatches CASCADE;
      DROP TABLE IF EXISTS quotes CASCADE;
      DROP TABLE IF EXISTS provider_locations CASCADE;
      DROP TABLE IF EXISTS provider_service_capabilities CASCADE;
      DROP TABLE IF EXISTS wallet_transactions CASCADE;
      DROP TABLE IF EXISTS booking_photos CASCADE;
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS service_requests CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS service_categories CASCADE;
      DROP TABLE IF EXISTS user_login CASCADE;
      DROP TABLE IF EXISTS agent_login CASCADE;
    `);
    console.log('   ✅ All old tables and views removed.');

    console.log('2. Creating fresh, properly structured tables with constraints & triggers...');
    await initDatabase();

    console.log('3. Validating new tables in database:');
    const tablesRes = await client.query(`
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.table(tablesRes.rows);

    const userCount = await client.query('SELECT COUNT(*) FROM user_login;');
    const agentCount = await client.query('SELECT COUNT(*) FROM agent_login;');
    const serviceCount = await client.query('SELECT COUNT(*) FROM services;');
    const bookingCount = await client.query('SELECT COUNT(*) FROM bookings;');
    const requestCount = await client.query('SELECT COUNT(*) FROM service_requests;');
    const quoteCount = await client.query('SELECT COUNT(*) FROM quotes;');

    console.log('📊 Clean Database State:');
    console.log(`   - user_login (Customer Accounts): ${userCount.rows[0].count} records`);
    console.log(`   - agent_login (Partner Accounts): ${agentCount.rows[0].count} records`);
    console.log(`   - services (Catalog Services): ${serviceCount.rows[0].count} active items`);
    console.log(`   - bookings (Service Orders): ${bookingCount.rows[0].count} records`);
    console.log(`   - service_requests (Requests): ${requestCount.rows[0].count} records`);
    console.log(`   - quotes (Provider Quotes): ${quoteCount.rows[0].count} records`);
    console.log('==============================================');
    console.log('✨ Database reset and initialization complete!');
    console.log('==============================================');
  } catch (err) {
    console.error('❌ Error resetting database:', err);
    if (client) client.release();
    await pool.end();
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
    process.exit(0);
  }
}

resetDatabase();
