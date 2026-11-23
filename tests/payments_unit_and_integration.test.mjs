import assert from 'assert';
import crypto from 'crypto';
import { toPaise, toRupees, calculatePlatformFee, formatINR } from '../apps/api/src/utils/money.js';
import { MockPaymentProvider } from '../apps/api/src/modules/payments/mockPaymentProvider.js';
import { RazorpayProvider } from '../apps/api/src/modules/payments/razorpayProvider.js';
import { PaymentService } from '../apps/api/src/modules/payments/paymentService.js';
import { setPaymentProvider } from '../apps/api/src/modules/payments/index.js';
import { pool } from '../apps/api/src/config/db.js';

let totalTests = 0;
let passedTests = 0;

function pass(name) {
  totalTests++;
  passedTests++;
  console.log(`  ✅ [PASS] ${name}`);
}

function fail(name, err) {
  totalTests++;
  console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  throw err;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runPaymentTests() {
  console.log('\n===============================================================');
  console.log('   NivaaroFix Online Payments & Route Settlements Test Suite   ');
  console.log('===============================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. UNIT TESTS: Paise Rounding & IEEE-754 Precision
    // -------------------------------------------------------------------------
    console.log('--- 1. UNIT TESTS: Integer Paise & Money Formatting ---');
    {
      assert.strictEqual(toPaise(0), 0);
      assert.strictEqual(toPaise(300), 30000);
      assert.strictEqual(toPaise(1250.50), 125050);
      assert.strictEqual(toPaise('1250.50'), 125050);
      assert.strictEqual(toPaise(19.99), 1999);
      assert.strictEqual(toRupees(30000), '300.00');
      assert.strictEqual(toRupees(125050), '1250.50');
      assert.strictEqual(toRupees(1999), '19.99');
      pass('Paise and Rupee bidirectional conversions are exact');

      // Platform fee math
      const fee0 = calculatePlatformFee(300, 0);
      assert.strictEqual(fee0.totalPaise, 30000);
      assert.strictEqual(fee0.platformFeePaise, 0);
      assert.strictEqual(fee0.professionalAmountPaise, 30000);
      assert.strictEqual(fee0.platformFeeRupees, '0.00');
      assert.strictEqual(fee0.professionalAmountRupees, '300.00');

      const fee10 = calculatePlatformFee(1250, 10);
      assert.strictEqual(fee10.totalPaise, 125000);
      assert.strictEqual(fee10.platformFeePaise, 12500);
      assert.strictEqual(fee10.professionalAmountPaise, 112500);
      assert.strictEqual(fee10.platformFeeRupees, '125.00');
      assert.strictEqual(fee10.professionalAmountRupees, '1125.00');

      // Invariant: platform fee + professional amount must strictly equal total amount
      const feeOdd = calculatePlatformFee(333.33, 7.5);
      assert.strictEqual(feeOdd.platformFeePaise + feeOdd.professionalAmountPaise, feeOdd.totalPaise);
      pass('Platform fee math and remainder invariants hold without floating point loss');

      // INR Tabular formatting
      const formatted = formatINR(1250.50);
      assert.ok(formatted.includes('1,250.50') || formatted.includes('1250.50'), `Formatted INR check: ${formatted}`);
      pass('INR tabular grouping formatted properly');
    }

    // -------------------------------------------------------------------------
    // 2. UNIT TESTS: Cryptographic Signatures (Valid, Tampered, Wrong Secret)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. UNIT TESTS: Cryptographic Signature Verification ---');
    {
      const mock = new MockPaymentProvider({ secret: 'secret_alpha_key_999' });
      const orderId = 'order_test_123';
      const paymentId = 'pay_test_456';
      const validSig = mock.generateCheckoutSignature(orderId, paymentId);

      // Valid signature
      assert.strictEqual(
        mock.verifyCheckoutSignature({ orderId, paymentId, signature: validSig }),
        true,
        'Expected valid signature to verify'
      );
      pass('Valid cryptographic checkout signature passes');

      // Tampered signature (altered byte)
      const tamperedSig = validSig.slice(0, -2) + 'aa';
      assert.strictEqual(
        mock.verifyCheckoutSignature({ orderId, paymentId, signature: tamperedSig }),
        false,
        'Expected tampered signature to be rejected'
      );
      pass('Tampered signature is strictly rejected');

      // Wrong secret provider
      const wrongProvider = new MockPaymentProvider({ secret: 'wrong_secret_key_888' });
      assert.strictEqual(
        wrongProvider.verifyCheckoutSignature({ orderId, paymentId, signature: validSig }),
        false,
        'Expected wrong secret signature to be rejected'
      );
      pass('Signature generated with wrong secret is rejected');

      // Tampered orderId / paymentId
      assert.strictEqual(
        mock.verifyCheckoutSignature({ orderId: 'order_hacked_999', paymentId, signature: validSig }),
        false,
        'Expected modified orderId to fail verification'
      );
      pass('Mismatched order/payment IDs fail signature verification');
    }

    // -------------------------------------------------------------------------
    // 3. INTEGRATION: Database State Fixtures Setup
    // -------------------------------------------------------------------------
    console.log('\n--- 3. INTEGRATION SETUP: Test Customer, Professional & Booking ---');
    const mockProvider = new MockPaymentProvider();
    setPaymentProvider(mockProvider);

    const timestamp = Date.now();
    const customerEmail = `paycust_${timestamp}@test.com`;
    const proEmail = `paypro_${timestamp}@test.com`;
    const proPhone = String(timestamp).slice(-10);

    // 1. Create test customer
    const userRes = await pool.query(`
      INSERT INTO users (email, phone, password_hash, role, auth_provider, is_phone_verified)
      VALUES ($1, $2, 'hash', 'customer', 'local', true)
      RETURNING id;
    `, [customerEmail, `+91 98${proPhone.slice(2)}`]);
    const customerUserId = userRes.rows[0].id;

    const custRes = await pool.query(`
      INSERT INTO customers (user_id, customer_code, name, email, phone, permanent_address, lat, lng)
      VALUES ($1, $2, 'Payment Test Customer', $3, $4, '123 Test Residency', 12.9716, 77.5946)
      RETURNING id;
    `, [customerUserId, `CUST${timestamp.toString().slice(-6)}`, customerEmail, `+91 98${proPhone.slice(2)}`]);
    const customerId = custRes.rows[0].id;

    // 2. Create test professional with linked bank account
    const proUserRes = await pool.query(`
      INSERT INTO users (email, phone, password_hash, role, auth_provider, is_phone_verified)
      VALUES ($1, $2, 'hash', 'professional', 'local', true)
      RETURNING id;
    `, [proEmail, proPhone]);
    const proUserId = proUserRes.rows[0].id;

    const proRes = await pool.query(`
      INSERT INTO professionals (
        user_id, professional_code, name, email, phone, trade, experience_years,
        address, kyc_status, is_online, availability_status, wallet_balance, lat, lng,
        provider_linked_account_id, payout_status, bank_name, bank_last4
      ) VALUES (
        $1, $2, 'Ramesh Electrician', $3, $4, 'electrician', 6,
        '45 Market Road', 'verified', true, 'available', 0.00, 12.9716, 77.5946,
        'acc_mock_test_123', 'active', 'HDFC Bank', '5678'
      ) RETURNING id;
    `, [proUserId, `PRO${timestamp.toString().slice(-6)}`, proEmail, proPhone]);
    const proId = proRes.rows[0].id;

    await pool.query(`
      INSERT INTO agent_login (partner_id, name, email, phone, trade, password, is_online, kyc_status, payout_status, bank_name, bank_last4)
      VALUES ($1, 'Ramesh Electrician', $2, $3, 'electrician', 'hash', true, 'verified', 'active', 'HDFC Bank', '5678')
      ON CONFLICT (email) DO UPDATE SET payout_status = 'active';
    `, [`PARTNER_${timestamp.toString().slice(-6)}`, proEmail, proPhone]);

    // 3. Create completed service request & accepted quote
    const srRes = await pool.query(`
      INSERT INTO service_requests (
        service_request_code, request_ref, customer_id, user_id, user_email, user_name, user_phone,
        service_id, service_title, category, problem_description, user_address, lat, lng,
        status, assigned_professional_id, otp_verified, otp_verified_at
      ) VALUES (
        $1, $2, $3, $4, $5, 'Payment Test Customer', '9876543210',
        1, 'Switchboard Sparking Repair', 'electrician', 'Sparks in bedroom board', '123 Test Residency', 12.9716, 77.5946,
        'completed', $6, true, CURRENT_TIMESTAMP
      ) RETURNING id, request_ref;
    `, [`SR${timestamp.toString().slice(-6)}`, `REQ_${timestamp}`, customerId, customerUserId, customerEmail, proId]);
    const booking = srRes.rows[0];

    const quoteRes = await pool.query(`
      INSERT INTO quotes (
        service_request_id, professional_id, amount, currency, status
      ) VALUES ($1, $2, 450.00, 'INR', 'accepted')
      RETURNING id, amount;
    `, [booking.id, proId]);
    const quote = quoteRes.rows[0];

    await pool.query('UPDATE service_requests SET accepted_quote_id = $1 WHERE id = $2;', [quote.id, booking.id]);
    pass('Test customer, professional, and completed booking fixture ready');

    // -------------------------------------------------------------------------
    // 4. INTEGRATION: Order Creation & Server-Determined Amount
    // -------------------------------------------------------------------------
    console.log('\n--- 4. INTEGRATION: Order Creation & Reuse ---');
    {
      // Attempt from wrong customer should be rejected with 403
      await assert.rejects(
        PaymentService.createOrderForBooking({
          bookingIdentifier: booking.id,
          customerId: 9999999,
          customerEmail: 'imposter@test.com'
        }),
        (err) => err.status === 403,
        'Expected 403 for unauthorized order creation'
      );
      pass('Unauthorized customer is blocked from creating orders for another booking');

      // Valid order creation by owner
      const orderResult1 = await PaymentService.createOrderForBooking({
        bookingIdentifier: booking.id,
        customerId: customerId,
        customerEmail: customerEmail
      });

      assert.strictEqual(orderResult1.status, 'due');
      assert.strictEqual(orderResult1.order.amount, 45000); // 450.00 INR in paise
      assert.ok(orderResult1.order.id.startsWith('order_mock_'));
      assert.strictEqual(orderResult1.payment.service_request_id, String(booking.id));
      assert.strictEqual(Number(orderResult1.payment.amount), 450);
      pass('Order created with server-determined amount in integer paise');

      // Second call must REUSE open order (not create duplicates)
      const orderResult2 = await PaymentService.createOrderForBooking({
        bookingIdentifier: booking.id,
        customerId: customerId,
        customerEmail: customerEmail
      });
      assert.strictEqual(orderResult2.order.id, orderResult1.order.id, 'Expected same provider_order_id to be reused');
      pass('Subsequent order requests reuse open order without duplicate rows');
    }

    // -------------------------------------------------------------------------
    // 5. INTEGRATION: Checkout Signature Verification -> Moves to 'processing'
    // -------------------------------------------------------------------------
    console.log('\n--- 5. INTEGRATION: Checkout Signature Verification ---');
    let testOrderId;
    let testPaymentId = `pay_mock_${Date.now()}`;
    {
      const currentPayRes = await pool.query('SELECT * FROM payments WHERE service_request_id = $1;', [booking.id]);
      const currentPay = currentPayRes.rows[0];
      testOrderId = currentPay.provider_order_id;

      // Tampered signature must fail
      await assert.rejects(
        PaymentService.verifyCheckout({
          bookingIdentifier: booking.id,
          orderId: testOrderId,
          paymentId: testPaymentId,
          signature: 'invalid_tampered_signature_hex_1234567890',
          customerId: customerId,
          customerEmail: customerEmail
        }),
        (err) => err.status === 400,
        'Expected 400 for bad signature'
      );
      pass('Tampered client signature rejected with 400');

      // Valid signature moves to processing
      const validSig = mockProvider.generateCheckoutSignature(testOrderId, testPaymentId);
      const verifyRes = await PaymentService.verifyCheckout({
        bookingIdentifier: booking.id,
        orderId: testOrderId,
        paymentId: testPaymentId,
        signature: validSig,
        customerId: customerId,
        customerEmail: customerEmail
      });

      assert.strictEqual(verifyRes.status, 'processing');
      const updatedPay = await pool.query('SELECT status, provider_payment_id FROM payments WHERE id = $1;', [currentPay.id]);
      assert.strictEqual(updatedPay.rows[0].status, 'processing');
      assert.strictEqual(updatedPay.rows[0].provider_payment_id, testPaymentId);
      pass('Valid checkout signature transitions payment state to processing');
    }

    // -------------------------------------------------------------------------
    // 6. INTEGRATION: Webhook payment.captured -> Paid & Route Settlement
    // -------------------------------------------------------------------------
    console.log('\n--- 6. INTEGRATION: Webhook Capture & Route Settlement ---');
    {
      const eventId = `evt_test_capture_${Date.now()}`;
      const capturePayload = {
        id: eventId,
        entity: 'event',
        event: 'payment.captured',
        contains: ['payment'],
        payload: {
          payment: {
            entity: {
              id: testPaymentId,
              entity: 'payment',
              amount: 45000,
              currency: 'INR',
              status: 'captured',
              order_id: testOrderId,
              method: 'upi',
              captured: true
            }
          }
        },
        created_at: Math.floor(Date.now() / 1000)
      };

      const rawBody = JSON.stringify(capturePayload);
      const signature = mockProvider.generateWebhookSignature(rawBody);

      // Process webhook
      const webhookRes = await PaymentService.handleWebhook({
        rawBody,
        signature,
        eventIdHeader: eventId
      });

      assert.strictEqual(webhookRes.processed, true);

      // Verify payment row updated to paid
      const paidCheck = await pool.query('SELECT status, captured_at, method FROM payments WHERE service_request_id = $1;', [booking.id]);
      assert.strictEqual(paidCheck.rows[0].status, 'paid');
      assert.strictEqual(paidCheck.rows[0].method, 'upi');
      assert.ok(paidCheck.rows[0].captured_at !== null);

      // Verify Route transfer row created for professional
      const transferCheck = await pool.query('SELECT * FROM payment_transfers WHERE professional_id = $1;', [proId]);
      assert.strictEqual(transferCheck.rows.length, 1);
      assert.strictEqual(Number(transferCheck.rows[0].amount), 450);
      assert.ok(['settled', 'processing'].includes(transferCheck.rows[0].status));

      // Verify Professional wallet updated
      const proWallet = await pool.query('SELECT wallet_balance FROM professionals WHERE id = $1;', [proId]);
      assert.strictEqual(Number(proWallet.rows[0].wallet_balance), 450);
      pass('Webhook payment.captured settles payment and executes Route transfer');

      // Duplicate Webhook must be ignored idempotently
      const dupRes = await PaymentService.handleWebhook({
        rawBody,
        signature,
        eventIdHeader: eventId
      });
      assert.strictEqual(dupRes.duplicate, true);
      pass('Duplicate webhook event handled idempotently without duplicate transfers');
    }

    // -------------------------------------------------------------------------
    // 7. INTEGRATION: Unpaid Gating Rule
    // -------------------------------------------------------------------------
    console.log('\n--- 7. INTEGRATION: Unpaid Completed Booking Gating ---');
    {
      // Since booking 1 is paid, customer has no unpaid booking
      const checkPaid = await PaymentService.checkUnpaidCompletedJobs(customerId);
      assert.strictEqual(checkPaid.hasUnpaid, false);
      pass('Fully paid customer has zero unpaid blocking alerts');

      // Create an unpaid completed booking 2
      const sr2Res = await pool.query(`
        INSERT INTO service_requests (
          service_request_code, request_ref, customer_id, user_id, user_email, user_name, user_phone,
          service_id, service_title, category, user_address, lat, lng, status, assigned_professional_id, otp_verified
        ) VALUES (
          'SR_UNPAID', $1, $2, $3, $4, 'Payment Test Customer', '9876543210',
          1, 'Tap Leak Repair', 'plumber', '123 Test Residency', 12.9716, 77.5946, 'completed', $5, true
        ) RETURNING id;
      `, [`REQ_UNPAID_${Date.now()}`, customerId, customerUserId, customerEmail, proId]);

      // Check gating now: customer must be blocked from new requests!
      const checkUnpaid = await PaymentService.checkUnpaidCompletedJobs(customerId);
      assert.strictEqual(checkUnpaid.hasUnpaid, true);
      assert.strictEqual(checkUnpaid.serviceTitle, 'Tap Leak Repair');
      pass('Unpaid completed booking triggers "Pay for your previous service first" block');

      // Clean up test booking 2
      await pool.query('DELETE FROM service_requests WHERE id = $1;', [sr2Res.rows[0].id]);
    }

    // -------------------------------------------------------------------------
    // 8. INTEGRATION: Professional Payout Setup & Status Gating
    // -------------------------------------------------------------------------
    console.log('\n--- 8. INTEGRATION: Professional Payout Setup & Gating ---');
    {
      // Create new unconfigured professional
      const rawProRes = await pool.query(`
        INSERT INTO professionals (
          professional_code, name, email, phone, trade, payout_status, address
        ) VALUES ($1, 'New Plumber', $2, '9876000000', 'plumber', 'not_set', '78 Pipe St')
        RETURNING id;
      `, [`PRO_NEW_${Date.now()}`, `newpro_${Date.now()}@test.com`]);
      const newProId = rawProRes.rows[0].id;

      // Status must be inactive
      const initialStatus = await PaymentService.checkProfessionalPayoutStatus(newProId);
      assert.strictEqual(initialStatus.isActive, false);
      assert.strictEqual(initialStatus.payoutStatus, 'not_set');
      pass('New professional starts with payout_status = not_set');

      // Submit payout details with PAN and Bank
      const payoutResult = await PaymentService.saveProfessionalPayout({
        professionalId: newProId,
        name: 'New Plumber',
        email: `newpro_${Date.now()}@test.com`,
        phone: '9876000000',
        accountNumber: '12345678901234',
        ifsc: 'HDFC0001234',
        pan: 'ABCDE1234F'
      });

      assert.strictEqual(payoutResult.payout_status, 'active');
      assert.strictEqual(payoutResult.bank_name, 'HDFC Bank');
      assert.strictEqual(payoutResult.bank_last4, '1234');
      pass('Professional payout setup successfully verified and activated with masked bank details');

      // Clean up
      await pool.query('DELETE FROM professionals WHERE id = $1;', [newProId]);
    }

    // -------------------------------------------------------------------------
    // 9. INTEGRATION: Administrative Refund & Reversal
    // -------------------------------------------------------------------------
    console.log('\n--- 9. INTEGRATION: Administrative Refund & Reversal ---');
    {
      const refundRes = await PaymentService.issueRefund({
        bookingIdentifier: booking.id,
        adminId: null,
        reason: 'Service quality dispute'
      });

      assert.strictEqual(refundRes.success, true);
      assert.strictEqual(refundRes.status, 'refunded');

      // Payment row must be marked refunded
      const payStatus = await pool.query('SELECT status FROM payments WHERE service_request_id = $1;', [booking.id]);
      assert.strictEqual(payStatus.rows[0].status, 'refunded');

      // Refund row must be recorded
      const refCheck = await pool.query('SELECT * FROM refunds WHERE payment_id = (SELECT id FROM payments WHERE service_request_id = $1);', [booking.id]);
      assert.strictEqual(refCheck.rows.length, 1);
      assert.strictEqual(Number(refCheck.rows[0].amount), 450);

      // Professional wallet balance reversed
      const proWalletAfter = await pool.query('SELECT wallet_balance FROM professionals WHERE id = $1;', [proId]);
      assert.strictEqual(Number(proWalletAfter.rows[0].wallet_balance), 0);
      pass('Admin refund successfully processed, reversing captured payment and professional balance');
    }

    // -------------------------------------------------------------------------
    // 10. INTEGRATION: Earnings & Settlements Breakdown
    // -------------------------------------------------------------------------
    console.log('\n--- 10. INTEGRATION: Professional Earnings & Settlements ---');
    {
      const earnings = await PaymentService.getProfessionalEarnings(proId);
      assert.ok('summary' in earnings);
      assert.ok('jobs' in earnings);
      assert.ok('payoutAccount' in earnings);
      assert.strictEqual(earnings.payoutAccount.bankName, 'HDFC Bank');
      assert.strictEqual(earnings.payoutAccount.bankLast4, '5678');
      pass('Professional earnings and settlements API returns structured financial ledger');
    }

    console.log('\n===============================================================');
    console.log(`   ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY! 🚀 `);
    console.log('===============================================================\n');

  } catch (err) {
    fail('Test suite execution failed', err);
    process.exit(1);
  } finally {
    try {
      await pool.end();
    } catch (_) {}
    process.exit(0);
  }
}

runPaymentTests();
