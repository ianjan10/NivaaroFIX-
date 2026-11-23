import { pool } from '../apps/api/src/config/db.js';

const TICKET_FIXES = [
  {
    ticket_code: '2026000001',
    sender_role: 'customer',
    sender_name: 'Aditi Sharma',
    category: 'Payment, Billing & Refund Dispute',
    subject: 'Duplicate UPI deduction for Booking #BK-2041',
    description: 'Paid ₹499 via UPI for service visit (Ref: UTR 829104). The amount was deducted twice from my bank account while booking was marked confirmed once.',
    solution: 'Verified duplicate deduction with payment gateway logs. Duplicate charge of ₹499 refunded to original bank account (ARN 92014891).'
  },
  {
    ticket_code: '2026000002',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'Payout, Bank & Wallet Settlement',
    subject: 'Weekly payout transfer not credited to HDFC bank account',
    description: 'Weekly payout of ₹4,250 processed on Tuesday shows completed in professional app, but IMPS transfer has not credited to registered account ending in 4019.',
    solution: 'IMPS transaction reference UTR-91823901 confirmed with partner bank. Funds credited to registered bank account.'
  },
  {
    ticket_code: '2026000003',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'App Technical Bug & Crash',
    subject: 'Door OTP verification timeout at customer doorstep',
    description: 'Customer provided OTP 4821 on arrival, but app showed timeout error 504 on booking #BK-8842. Had to wait 15 minutes to mark service started.',
    solution: 'OTP sync issue resolved with cloud cache update. Booking status adjusted without penalty.'
  },
  {
    ticket_code: '2026000004',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'Customer Misconduct or Fare Dispute',
    subject: 'Customer refused to pay remaining cash component on completion',
    description: 'Booking #BK-8491 had cash on service balance of ₹350. Customer claimed they only pay online. Need assistance claiming payment.',
    solution: 'Customer contacted by operations team. Balance of ₹350 credited to partner wallet.'
  },
  {
    ticket_code: '2026000005',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'KYC, Documents & Identity Verification',
    subject: 'Aadhaar verification document re-upload stuck on review',
    description: 'Uploaded clear color copy of Aadhaar card as requested 2 days ago. Still shows review pending in partner console.',
    solution: 'Document verified and partner console KYC status approved.'
  },
  {
    ticket_code: '2026000006',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'Dispatch, Acceptance & Lead Feed',
    subject: 'Dispatch notifications silent while app running in background',
    description: 'Missed two urgent plumbing leads because push notification chime did not alert when phone screen was locked.',
    solution: 'Notification channel priority updated for partner build. Recommended disabling OS battery saver for NivaaroFix Pro.'
  },
  {
    ticket_code: '2026000007',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'Payout, Bank & Wallet Settlement',
    subject: 'Incorrect platform fee deduction on Booking #BK-9120',
    description: 'Platform commission deducted was 22% instead of the standard 15% tier for verified gold partners.',
    solution: 'Commission tier recalculated. Difference of ₹140 credited back to partner wallet.'
  },
  {
    ticket_code: '2026000008',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'Customer Misconduct or Fare Dispute',
    subject: 'Customer cancelled booking after arrival at location',
    description: 'Reached customer premise at Sector 45 within 25 minutes. Customer cancelled stating problem resolved. Requesting standard travel allowance.',
    solution: 'Cancellation policy applied. ₹150 travel reimbursement credited to wallet.'
  },
  {
    ticket_code: '2026000009',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'App Technical Bug & Crash',
    subject: 'Cannot upload completion photos on Samsung Galaxy device',
    description: 'Camera view freezes when attempting to submit before/after service photo proofs.',
    solution: 'Fixed Android camera intent handler in app update v2.4.1.'
  },
  {
    ticket_code: '2026000010',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'Partner Support & Account Assistance',
    subject: 'Request to update registered mobile number for SMS OTPs',
    description: 'Need to update registered partner mobile number to 9876543210 due to SIM card upgrade.',
    solution: 'Secondary verification completed via registered email. Primary mobile number updated.'
  },
  {
    ticket_code: '2026000011',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'Dispatch, Acceptance & Lead Feed',
    subject: 'Service radius location pin showing incorrect home base',
    description: 'GPS home base pin is locked to old workshop address in Indiranagar instead of Koramangala.',
    solution: 'Service area coordinates updated to current workshop location.'
  },
  {
    ticket_code: '2026000012',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'Payout, Bank & Wallet Settlement',
    subject: 'Instant payout button disabled in wallet screen',
    description: 'Attempted instant settlement for ₹1,200 but button appears greyed out.',
    solution: 'Daily settlement limit refreshed. Instant payout processed.'
  },
  {
    ticket_code: '2026000013',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'KYC, Documents & Identity Verification',
    subject: 'Trade certification document expiry date correction',
    description: 'Uploaded plumber vocational certificate shows wrong expiry date in system.',
    solution: 'Certificate validity extended as per issuing authority document.'
  },
  {
    ticket_code: '2026000020',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'Dispatch, Acceptance & Lead Feed',
    subject: 'Job acceptance button failed with network error #408',
    description: 'Tried accepting high-priority dispatch at 11:20 AM, received error 408.',
    solution: 'Server timeout threshold increased on dispatch gateway.'
  },
  {
    ticket_code: '2026000021',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'Payout, Bank & Wallet Settlement',
    subject: 'Bank account IFSC update verification pending',
    description: 'Submitted updated IFSC code for State Bank of India account ending in 8812. Kindly verify for payouts.',
    solution: 'Penny drop verification succeeded. New bank account activated for payouts.'
  },
  {
    ticket_code: '2026000022',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'App Technical Bug & Crash',
    subject: 'Navigation route in partner console showing toll roads only',
    description: 'In-app navigation redirects through toll expressway instead of local arterial road.',
    solution: 'Routing engine configuration updated to prefer toll-free partner routes.'
  },
  {
    ticket_code: '2026000026',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'Payout, Bank & Wallet Settlement',
    subject: 'TDS deduction certificate (Form 16A) request for Q3',
    description: 'Need quarterly TDS certificate for tax filing for income earned between July and September.',
    solution: 'Form 16A generated and dispatched to registered email.'
  },
  {
    ticket_code: '2026000027',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'Customer Misconduct or Fare Dispute',
    subject: 'Customer requested unauthorized electrical alteration outside scope',
    description: 'Customer insisted on rewiring entire building main panel without formal booking upgrade.',
    solution: 'Customer advised on standard safety protocol. Professional commended for safety compliance.'
  },
  {
    ticket_code: '2026000028',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'App Technical Bug & Crash',
    subject: 'Partner app logs out automatically after completing booking',
    description: 'Session token expires prematurely upon clicking "Complete Job".',
    solution: 'Session token refresh mechanism corrected in backend auth layer.'
  },
  {
    ticket_code: '2026000029',
    sender_role: 'professional',
    sender_name: 'Mahesh Kumar',
    category: 'Payout, Bank & Wallet Settlement',
    subject: 'Monthly incentive milestone bonus not credited to partner balance',
    description: 'Achieved 25 completed jobs milestone for the month with 4.9 rating. Incentive bonus of ₹1,500 not reflected in wallet balance.',
    solution: 'Milestone verified by operations supervisor. ₹1,500 bonus credited to partner wallet.'
  }
];

async function run() {
  console.log('Sanitizing support tickets to realistic platform & partner categories...');

  for (const item of TICKET_FIXES) {
    await pool.query(`
      UPDATE support_tickets
      SET
        sender_role = $1,
        sender_name = $2,
        category = $3,
        subject = $4,
        description = $5,
        solution = $6
      WHERE ticket_code = $7;
    `, [
      item.sender_role,
      item.sender_name,
      item.category,
      item.subject,
      item.description,
      item.solution,
      item.ticket_code
    ]);
  }

  // Update timeline updates for 2026000029
  const ticket29Res = await pool.query("SELECT id FROM support_tickets WHERE ticket_code = '2026000029' LIMIT 1;");
  if (ticket29Res.rows.length > 0) {
    const tid = ticket29Res.rows[0].id;
    await pool.query(`
      UPDATE support_ticket_updates
      SET message = 'Please upload bank statement screenshot or UTR number showing missing incentive credit.'
      WHERE ticket_id = $1 AND update_type = 'info_request';
    `, [tid]);

    await pool.query(`
      UPDATE support_ticket_updates
      SET message = 'Attached bank statement screenshot showing transaction history for the month. Milestone bonus of ₹1,500 is missing.'
      WHERE ticket_id = $1 AND update_type = 'user_reply';
    `, [tid]);

    await pool.query(`
      UPDATE support_ticket_updates
      SET message = 'Milestone verified by operations supervisor. ₹1,500 bonus credited to partner wallet.'
      WHERE ticket_id = $1 AND update_type IN ('resolved', 'resolution');
    `, [tid]);
  }

  console.log('✅ Successfully sanitized all support tickets in database!');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
