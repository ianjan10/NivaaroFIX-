import { pool } from '../config/db.js';

async function cleanTestAccounts() {
  console.log('🧹 Cleaning dummy/test accounts from database...');

  // 1. Delete all dummy agent accounts
  const agentResult = await pool.query(`
    DELETE FROM agent_login
    WHERE 
      name IN ('Professional Partner', 'Test Agent', 'QA Partner 4050')
      OR email LIKE '%test.agent%@example.com'
      OR email LIKE '%qa_agent_test%'
      OR partner_id LIKE 'FIX-PRO-%'
  `);
  console.log(`✅ Deleted ${agentResult.rowCount} dummy agent/partner accounts.`);

  // 2. Delete all dummy customer/user accounts
  const userResult = await pool.query(`
    DELETE FROM user_login
    WHERE 
      name IN ('Test Customer', 'Test User')
      OR email LIKE '%test.customer%@example.com'
      OR email LIKE '%test.user%@example.com'
      OR email LIKE '%@nivaarofix.test'
  `);
  console.log(`✅ Deleted ${userResult.rowCount} dummy customer accounts.`);

  // 3. Clean up orphaned wallet transactions, dispatches, quotes linked to deleted agents
  const wtResult = await pool.query(`
    DELETE FROM wallet_transactions
    WHERE agent_id NOT IN (SELECT id FROM agent_login)
  `);
  console.log(`✅ Deleted ${wtResult.rowCount} orphaned wallet transactions.`);

  // 4. Show what's left
  const agents = await pool.query('SELECT partner_id, name, email, city, wallet_balance FROM agent_login ORDER BY created_at');
  const users = await pool.query('SELECT name, email, city FROM user_login ORDER BY created_at');

  console.log('\n📊 Remaining Agent Accounts:');
  console.table(agents.rows);

  console.log('\n📊 Remaining Customer Accounts:');
  console.table(users.rows);

  await pool.end();
  process.exit(0);
}

cleanTestAccounts().catch(err => {
  console.error('❌ Cleanup error:', err);
  process.exit(1);
});
