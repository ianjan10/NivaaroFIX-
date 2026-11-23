# Architecture Decision Record: Future Razorpay Integration Architecture

**Date:** November 2026  
**Status:** PROPOSED / DEFERRED TO PHASE 2  
**Context:** Indian Hyperlocal Home Services Marketplace Payment & Settlement Infrastructure  

---

## 1. Executive Summary & Provider Selection

For future payment and settlement integration, **Razorpay** is the designated payment gateway and settlement partner for NivaaroFix:

1. **Customer Inbound Payments:** **Razorpay Standard Payment Gateway** (UPI Intent, UPI QR, Net Banking, Debit/Credit Cards, Wallets).
2. **Marketplace Professional Splits & Settlements:** **Razorpay Route** (Marketplace split payments, automated vendor settlements, linked accounts, fee commissions).
3. **Internal Ledger & Auditing:** NivaaroFix backend double-entry transaction database for payment verification, platform fee computation, refunds, and reconciliation.

> **CRITICAL COMPLIANCE NOTICE:**  
> In accordance with Reserve Bank of India (RBI) Payment Aggregator (PA) and Payment Gateway (PG) guidelines, automated marketplace payouts and split settlements via Razorpay Route require explicit underwriting approval and merchant eligibility verification from Razorpay prior to production enablement. No live payment endpoints, credentials, or client SDKs are implemented in Phase 1.

---

## 2. Planned System Architecture

```
[ Customer Frontend ] 
       │ 1. Checkout request
       ▼
[ NivaaroFix API ] ──── 2. Create Order ────► [ Razorpay Orders API ]
       │                                              │
       │ ◄────────── 3. order_id, key_id ─────────────┘
       │
[ Customer Browser ] ─── 4. Checkout Modal (UPI/Cards) ──► [ Razorpay PG ]
       │                                                        │
       │ ◄────────── 5. payment_id, signature ──────────────────┘
       ▼
[ NivaaroFix API ] ──── 6. Verify HMAC-SHA256 Signature
       │
       ├─── 7. Record Verified Payment in DB (State: CAPTURED)
       │
       └─── 8. Route Transfer API ───► [ Professional Linked Account ]
                   (Split: Agreed Pro Payout + 15% Platform Fee Holdback)
```

---

## 3. Core Architectural Requirements (For Phase 2)

### A. Customer Payment Flow (Razorpay Payment Gateway)
- **Order Generation:** Backend creates an order via Razorpay Orders API with integer amount in paise (`amount: grossAmount * 100`, `currency: "INR"`, `receipt: bookingRef`).
- **Cryptographic Signature Verification:** Backend verifies the payment signature using `crypto.createHmac('sha256', razorpay_key_secret).update(order_id + "|" + payment_id).digest('hex') === razorpay_signature`.
- **Payment Idempotency:** Duplicate webhook or client submission must never double-credit or double-book.

### B. Professional Settlements (Razorpay Route)
- **Linked Account Onboarding:** Service professionals must be onboarded as Linked Accounts under Razorpay Route, submitting verified bank account details (Account number, IFSC, Beneficiary name).
- **Split Transfers:** Payments captured from customers can be split immediately or scheduled for release upon OTP-verified job completion:
  - Professional Share: `(1 - Platform_Commission_Rate) * Gross_Service_Amount`.
  - NivaaroFix Platform Fee: `Platform_Commission_Rate * Gross_Service_Amount`.
- **Reversals & Refunds:** In the event of customer disputes or cancellations, Route Reversals transfer funds back from the Linked Account to the primary account for customer refund.

### C. Webhooks & Asynchronous Reliability
Razorpay webhooks must be validated using the configured Webhook Secret (`X-Razorpay-Signature` header):
- `payment.authorized` & `payment.captured`: Confirms customer payment.
- `payment.failed`: Updates booking state to Payment Failed.
- `transfer.processed` & `transfer.failed`: Tracks professional payout settlement.
- `settlement.processed`: Confirms bank settlement to Linked Accounts.
- `refund.processed`: Confirms customer refund completion.

### D. Provider-Independent Internal Abstraction
To avoid vendor lock-in and ensure long-term architectural health:
- The internal database will maintain generic tables: `payments`, `payment_transactions`, `settlements`, and `refunds`.
- Specific provider details (e.g. `gateway: 'razorpay'`, `gateway_order_id`, `gateway_payment_id`) will reside in clean metadata fields.
- The business logic will interact with an abstract `PaymentService` interface, making future multi-gateway routing (e.g. fallback gateways) seamless.

---

## 4. Official Documentation References

- **Razorpay Payment Gateway Overview:**  
  [https://razorpay.com/docs/payments/payment-gateway/](https://razorpay.com/docs/payments/payment-gateway/)
- **Razorpay Orders API:**  
  [https://razorpay.com/docs/api/orders/](https://razorpay.com/docs/api/orders/)
- **Razorpay Route (Marketplace Payouts & Split Payments):**  
  [https://razorpay.com/docs/payments/route/](https://razorpay.com/docs/payments/route/)
- **Razorpay Route Linked Accounts:**  
  [https://razorpay.com/docs/payments/route/linked-accounts/](https://razorpay.com/docs/payments/route/linked-accounts/)
- **Razorpay Webhooks & Signature Verification:**  
  [https://razorpay.com/docs/webhooks/](https://razorpay.com/docs/webhooks/)

