import { pool } from '../config/db.js';

async function clearFakeEarnings() {
  console.log('🧹 Clearing fake/AI-generated earnings data...');

  // 1. Delete the fake "Ceiling Fan Repair" wallet transaction
  const delTx = await pool.query(
    `DELETE FROM wallet_transactions WHERE request_ref = 'NV-SR-71804'`
  );
  console.log(`✅ Deleted ${delTx.rowCount} fake wallet transaction(s).`);

  // 2. Reset kumar k's wallet balance and completed jobs to 0
  const resetAgent = await pool.query(
    `UPDATE agent_login SET wallet_balance = 0.00, completed_jobs = 0 WHERE partner_id = '202600009'`
  );
  console.log(`✅ Reset wallet_balance and completed_jobs for ${resetAgent.rowCount} agent(s).`);

  // 3. Clean up the fake service_requests entry (NV-SR-71804) if it exists
  const delReq = await pool.query(
    `DELETE FROM service_requests WHERE request_ref = 'NV-SR-71804'`
  );
  console.log(`✅ Deleted ${delReq.rowCount} fake service_request(s).`);

  // 4. Clean up any related quotes or dispatches for NV-SR-71804
  const delQuotes = await pool.query(
    `DELETE FROM quotes WHERE request_id IN (
      SELECT id FROM service_requests WHERE request_ref = 'NV-SR-71804'
    )`
  );
  console.log(`✅ Deleted ${delQuotes.rowCount} related quote(s).`);

  // 5. Final state verification
  const remainTx = await pool.query('SELECT COUNT(*) AS count FROM wallet_transactions');
  const agentState = await pool.query(
    `SELECT partner_id, name, wallet_balance, completed_jobs FROM agent_login ORDER BY created_at`
  );
  console.log(`\n📊 Remaining wallet transactions: ${remainTx.rows[0].count}`);
  console.log('\n📊 Agent account state:');
  console.table(agentState.rows);

  await pool.end();
  process.exit(0);
}

clearFakeEarnings().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
