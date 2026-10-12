import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgresql://postgres:root@localhost:5432/nivaarofix_db' });

const titleReplacements = [
  { oldRegex: /switchboard.*socket|switchboard.*replacement/i, newTitle: 'Switches & Sockets' },
  { oldRegex: /mcb.*trip|switchboard.*sparks.*mcb/i, newTitle: 'Tripping & Short Circuits' },
  { oldRegex: /ceiling.*fan|exhaust.*fan|fan.*chandelier/i, newTitle: 'Fans & Fittings' },
  { oldRegex: /inverter.*battery|inverter.*wiring/i, newTitle: 'Inverter & Backup Wiring' },
  { oldRegex: /complete.*rewiring|house.*wiring|hidden.*wiring/i, newTitle: 'Hidden Wiring & Earthing' },
  { oldRegex: /tap.*faucet|water.*tap|tap.*mixer/i, newTitle: 'Taps, Mixers & Showers' },
  { oldRegex: /drain.*blockage|drain.*basin|clogged.*sink/i, newTitle: 'Drains & Blocked Sinks' },
  { oldRegex: /concealed.*pipe|hidden.*pipe/i, newTitle: 'Hidden Pipe Leaks' },
  { oldRegex: /toilet.*flush|commode.*flush/i, newTitle: 'Toilet & Flush Tank' },
  { oldRegex: /water.*tank.*pump|sump.*motor|overhead.*tank/i, newTitle: 'Water Tank & Pump' },
  { oldRegex: /general.*inspection/i, newTitle: 'General Service' }
];

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add columns if not existing
    await client.query(`
      ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS completion_photos JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS completion_remarks TEXT;
      ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
      ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completion_photos JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completion_remarks TEXT;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
    `);
    console.log('Added completion columns and timestamps.');

    // 2. Drop restrictive check constraints and add modern state machine check constraints
    await client.query(`
      ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
      ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check 
        CHECK (status IN ('Open', 'Quoted', 'Confirmed', 'On the way', 'En Route', 'Arrived', 'In progress', 'In Progress', 'OTP Verified', 'Accepted', 'Completed', 'Cancelled', 'Expired'));

      ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
      ALTER TABLE bookings ADD CONSTRAINT bookings_status_check 
        CHECK (status IN ('Open', 'Quoted', 'Confirmed', 'Request Received', 'Pending', 'On the way', 'On The Way', 'En Route', 'Arrived', 'In progress', 'In Progress', 'OTP Verified', 'Completed', 'Cancelled'));
    `);
    console.log('Updated status check constraints on service_requests and bookings.');

    // 3. Migrate titles in service_requests
    const srs = await client.query('SELECT id, service_title FROM service_requests');
    for (const row of srs.rows) {
      for (const rep of titleReplacements) {
        if (rep.oldRegex.test(row.service_title)) {
          await client.query('UPDATE service_requests SET service_title = $1 WHERE id = $2', [rep.newTitle, row.id]);
          console.log(`Updated SR ${row.id}: "${row.service_title}" -> "${rep.newTitle}"`);
          break;
        }
      }
    }

    // 4. Migrate titles in bookings
    const bks = await client.query('SELECT id, service_title FROM bookings');
    for (const row of bks.rows) {
      for (const rep of titleReplacements) {
        if (rep.oldRegex.test(row.service_title)) {
          await client.query('UPDATE bookings SET service_title = $1 WHERE id = $2', [rep.newTitle, row.id]);
          console.log(`Updated Booking ${row.id}: "${row.service_title}" -> "${rep.newTitle}"`);
          break;
        }
      }
    }

    // 5. Migrate titles in services
    const svs = await client.query('SELECT id, title FROM services');
    for (const row of svs.rows) {
      for (const rep of titleReplacements) {
        if (rep.oldRegex.test(row.title)) {
          await client.query('UPDATE services SET title = $1 WHERE id = $2', [rep.newTitle, row.id]);
          console.log(`Updated Service ${row.id}: "${row.title}" -> "${rep.newTitle}"`);
          break;
        }
      }
    }

    await client.query('COMMIT');
    console.log('DATA MIGRATION COMPLETED SUCCESSFULLY!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
