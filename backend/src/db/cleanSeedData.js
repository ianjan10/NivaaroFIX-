import { pool } from '../config/db.js';

async function cleanData() {
  console.log('Cleaning up placeholder and seed data...');

  // 1. Delete all dummy wallet transactions (repeated Ceiling Fan Repair 382.5, etc.)
  const delWt = await pool.query(
    `DELETE FROM wallet_transactions 
     WHERE description ILIKE '%Ceiling Fan Repair%' 
        OR amount = 382.50 
        OR description ILIKE '%Switchboard%' 
        OR request_ref LIKE 'NV-SR-%'`
  );
  console.log(`Deleted ${delWt.rowCount} placeholder wallet transactions.`);

  // 2. Reset agent wallet balances to 0.00 and completed_jobs to 0
  const updAgent = await pool.query(
    `UPDATE agent_login 
     SET wallet_balance = 0.00, completed_jobs = 0;`
  );
  console.log(`Reset wallet balances and completed jobs for ${updAgent.rowCount} agent records.`);

  // 3. Clean up test quotes and requests
  const delQuotes = await pool.query(`DELETE FROM quotes WHERE request_id IN (SELECT id FROM service_requests WHERE request_ref LIKE 'NV-SR-%')`);
  console.log(`Deleted ${delQuotes.rowCount} test quotes.`);

  const delReqs = await pool.query(`DELETE FROM service_requests WHERE request_ref LIKE 'NV-SR-%'`);
  console.log(`Deleted ${delReqs.rowCount} test service requests.`);

  // 4. Verify remaining transactions
  const remainingTx = await pool.query('SELECT COUNT(*) FROM wallet_transactions');
  console.log(`Remaining wallet transactions in database: ${remainingTx.rows[0].count}`);

  await pool.end();
  process.exit(0);
}

cleanData().catch(err => {
  console.error('Clean error:', err);
  process.exit(1);
});
