import { pool } from '../../config/db.js';
import { maskPhone, maskEmail } from '../verification/approvalsService.js';

export function formatNumericalId(rawId, type = 'payment', fallbackId = '1', dateStr = null) {
  if (!rawId) return '—';
  const cleaned = String(rawId).trim();
  if (/^\d{8,16}$/.test(cleaned)) {
    return cleaned;
  }
  const d = dateStr ? new Date(dateStr) : new Date();
  const yyyy = isNaN(d.getTime()) ? '2026' : String(d.getFullYear());
  const mm = isNaN(d.getTime()) ? '11' : String(d.getMonth() + 1).padStart(2, '0');
  const dd = isNaN(d.getTime()) ? '22' : String(d.getDate()).padStart(2, '0');
  const numPart = String(fallbackId || cleaned).replace(/\D/g, '');
  const seq = (numPart.slice(-4) || '0001').padStart(4, '0');
  const subType = type === 'order' ? '01' : '00';
  return `${yyyy}${mm}${dd}${subType}${seq.slice(-2)}`;
}

export class AdminTransactionService {
  /**
   * Get Transactions list with filters, pagination, and KPI summary.
   */
  static async getTransactions({
    status = 'all',
    search = '',
    method = 'all',
    dateRange = 'all',
    sort = 'newest',
    page = 1,
    limit = 15
  }) {
    const conditions = [];
    const values = [];

    // 1. Status Filter
    if (status && status !== 'all') {
      values.push(status.toLowerCase());
      conditions.push(`p.status = $${values.length}`);
    }

    // 2. Method Filter
    if (method && method !== 'all') {
      values.push(method.toLowerCase());
      conditions.push(`LOWER(p.method) = $${values.length}`);
    }

    // 3. Date Range Filter
    if (dateRange === 'today') {
      conditions.push(`p.created_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE`);
    } else if (dateRange === '7d') {
      conditions.push(`p.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'`);
    } else if (dateRange === '30d') {
      conditions.push(`p.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'`);
    }

    // 4. Search Filter
    if (search && search.trim()) {
      values.push(`%${search.trim().toLowerCase()}%`);
      const sIdx = values.length;
      conditions.push(`(
        LOWER(p.payment_code) LIKE $${sIdx}
        OR LOWER(sr.service_request_code) LIKE $${sIdx}
        OR LOWER(sr.request_ref) LIKE $${sIdx}
        OR LOWER(c.name) LIKE $${sIdx}
        OR c.phone LIKE $${sIdx}
        OR LOWER(pr.name) LIKE $${sIdx}
        OR LOWER(pr.trade) LIKE $${sIdx}
        OR LOWER(COALESCE(p.provider_payment_id, '')) LIKE $${sIdx}
        OR LOWER(COALESCE(p.provider_order_id, '')) LIKE $${sIdx}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 5. Sorting
    let orderBy = 'p.created_at DESC';
    if (sort === 'oldest') {
      orderBy = 'p.created_at ASC';
    } else if (sort === 'amount_high') {
      orderBy = 'p.amount DESC, p.created_at DESC';
    } else if (sort === 'amount_low') {
      orderBy = 'p.amount ASC, p.created_at DESC';
    }

    // 6. Pagination limits
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageLimit = Math.min(50, Math.max(5, parseInt(limit, 10) || 15));
    const offset = (currentPage - 1) * pageLimit;

    // 7. Overall Aggregates (regardless of search for stable KPI metrics)
    const summaryRes = await pool.query(`
      SELECT 
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::NUMERIC AS total_gross_volume,
        COALESCE(SUM(platform_fee) FILTER (WHERE status = 'paid'), 0)::NUMERIC AS platform_revenue,
        COALESCE(SUM(professional_amount) FILTER (WHERE status = 'paid'), 0)::NUMERIC AS pro_payouts,
        COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0)::NUMERIC AS refunded_volume,
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE status = 'paid') AS settled_count,
        COUNT(*) FILTER (WHERE status = 'processing') AS processing_count,
        COUNT(*) FILTER (WHERE status = 'due') AS due_count,
        COUNT(*) FILTER (WHERE status = 'refunded') AS refunded_count,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
      FROM payments;
    `);

    const summaryRow = summaryRes.rows[0];

    // 8. Count filtered items
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM payments p
      LEFT JOIN customers c ON c.id = p.customer_id
      LEFT JOIN professionals pr ON pr.id = p.professional_id
      LEFT JOIN service_requests sr ON sr.id = p.service_request_id
      ${whereClause};
    `;
    const countRes = await pool.query(countQuery, values);
    const totalFiltered = parseInt(countRes.rows[0]?.total || 0, 10);
    const totalPages = Math.ceil(totalFiltered / pageLimit) || 1;

    // 9. Query rows
    const dataQuery = `
      SELECT 
        p.id,
        p.payment_code,
        p.service_request_id,
        sr.service_request_code AS booking_ref,
        sr.service_title,
        sr.category,
        p.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.email AS customer_email,
        p.professional_id,
        pr.name AS pro_name,
        pr.professional_code AS pro_code,
        pr.trade AS pro_trade,
        pr.phone AS pro_phone,
        p.amount,
        p.currency,
        p.platform_fee,
        p.professional_amount,
        p.status,
        p.provider,
        p.provider_order_id,
        p.provider_payment_id,
        p.method,
        p.failure_reason,
        p.captured_at,
        p.created_at,
        rf.id AS refund_id,
        rf.amount AS refund_amount,
        rf.reason AS refund_reason,
        rf.status AS refund_status,
        rf.created_at AS refund_created_at
      FROM payments p
      LEFT JOIN customers c ON c.id = p.customer_id
      LEFT JOIN professionals pr ON pr.id = p.professional_id
      LEFT JOIN service_requests sr ON sr.id = p.service_request_id
      LEFT JOIN refunds rf ON rf.payment_id = p.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2};
    `;

    const rowsRes = await pool.query(dataQuery, [...values, pageLimit, offset]);

    const transactions = rowsRes.rows.map((r) => ({
      id: r.id,
      transactionCode: r.payment_code,
      bookingRef: r.booking_ref || `#SR-${String(r.service_request_id).padStart(5, '0')}`,
      serviceRequestId: r.service_request_id,
      serviceTitle: r.service_title || 'General Maintenance',
      category: r.category || 'Service',
      amount: parseFloat(r.amount || 0),
      platformFee: parseFloat(r.platform_fee || 0),
      professionalAmount: parseFloat(r.professional_amount || 0),
      currency: r.currency || 'INR',
      status: r.status,
      provider: r.provider || 'razorpay',
      providerOrderId: formatNumericalId(r.provider_order_id, 'order', r.id, r.created_at),
      providerPaymentId: formatNumericalId(r.provider_payment_id, 'payment', r.id, r.created_at),
      method: r.method || (r.status === 'paid' ? 'upi' : '—'),
      failureReason: r.failure_reason,
      createdAt: r.created_at,
      capturedAt: r.captured_at,
      customer: {
        id: r.customer_id,
        name: r.customer_name || 'Customer',
        phone: r.customer_phone || '—',
        rawPhone: r.customer_phone,
        email: r.customer_email || '—'
      },
      professional: {
        id: r.professional_id,
        name: r.pro_name || 'Partner',
        code: r.pro_code || String(r.professional_id),
        trade: r.pro_trade || 'electrician',
        phone: r.pro_phone || '—'
      },
      refund: r.refund_id ? {
        id: r.refund_id,
        amount: parseFloat(r.refund_amount || 0),
        reason: r.refund_reason,
        status: r.refund_status,
        createdAt: r.refund_created_at
      } : null
    }));

    return {
      transactions,
      summary: {
        totalGrossVolume: parseFloat(summaryRow.total_gross_volume || 0),
        platformRevenue: parseFloat(summaryRow.platform_revenue || 0),
        professionalPayouts: parseFloat(summaryRow.pro_payouts || 0),
        refundedVolume: parseFloat(summaryRow.refunded_volume || 0),
        totalCount: parseInt(summaryRow.total_count || 0, 10),
        settledCount: parseInt(summaryRow.settled_count || 0, 10),
        processingCount: parseInt(summaryRow.processing_count || 0, 10),
        dueCount: parseInt(summaryRow.due_count || 0, 10),
        refundedCount: parseInt(summaryRow.refunded_count || 0, 10),
        failedCount: parseInt(summaryRow.failed_count || 0, 10)
      },
      pagination: {
        page: currentPage,
        limit: pageLimit,
        total: totalFiltered,
        totalPages
      }
    };
  }

  /**
   * Get single transaction detail.
   */
  static async getTransactionDetail(id) {
    const res = await pool.query(`
      SELECT 
        p.*,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.email AS customer_email,
        c.permanent_address AS customer_address,
        pr.name AS pro_name,
        pr.professional_code AS pro_code,
        pr.trade AS pro_trade,
        pr.phone AS pro_phone,
        sr.service_request_code AS booking_ref,
        sr.service_title,
        sr.category,
        sr.user_address,
        rf.id AS refund_id,
        rf.amount AS refund_amount,
        rf.reason AS refund_reason,
        rf.status AS refund_status,
        rf.created_at AS refund_created_at
      FROM payments p
      LEFT JOIN customers c ON c.id = p.customer_id
      LEFT JOIN professionals pr ON pr.id = p.professional_id
      LEFT JOIN service_requests sr ON sr.id = p.service_request_id
      LEFT JOIN refunds rf ON rf.payment_id = p.id
      WHERE p.id = $1
      LIMIT 1;
    `, [id]);

    if (res.rows.length === 0) {
      return null;
    }

    const r = res.rows[0];
    return {
      id: r.id,
      transactionCode: r.payment_code,
      bookingRef: r.booking_ref || `#SR-${String(r.service_request_id).padStart(5, '0')}`,
      serviceRequestId: r.service_request_id,
      serviceTitle: r.service_title || 'General Maintenance',
      category: r.category || 'Service',
      amount: parseFloat(r.amount || 0),
      platformFee: parseFloat(r.platform_fee || 0),
      professionalAmount: parseFloat(r.professional_amount || 0),
      currency: r.currency || 'INR',
      status: r.status,
      provider: r.provider || 'razorpay',
      providerOrderId: formatNumericalId(r.provider_order_id, 'order', r.id, r.created_at),
      providerPaymentId: formatNumericalId(r.provider_payment_id, 'payment', r.id, r.created_at),
      method: r.method,
      failureReason: r.failure_reason,
      createdAt: r.created_at,
      capturedAt: r.captured_at,
      customer: {
        id: r.customer_id,
        name: r.customer_name,
        phone: r.customer_phone,
        email: r.customer_email,
        address: r.customer_address || r.user_address
      },
      professional: {
        id: r.professional_id,
        name: r.pro_name,
        code: r.pro_code,
        trade: r.pro_trade,
        phone: r.pro_phone
      },
      refund: r.refund_id ? {
        id: r.refund_id,
        amount: parseFloat(r.refund_amount || 0),
        reason: r.refund_reason,
        status: r.refund_status,
        createdAt: r.refund_created_at
      } : null
    };
  }

  /**
   * Issue Administrative Refund for a settled payment.
   */
  static async issueRefund({ paymentId, adminId, reason = 'Administrative cancellation', ip = null, userAgent = null }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const payRes = await client.query(`
        SELECT id, payment_code, amount, status, provider_payment_id
        FROM payments
        WHERE id = $1
        FOR UPDATE;
      `, [paymentId]);

      if (payRes.rows.length === 0) {
        throw new Error('Transaction record not found.');
      }

      const p = payRes.rows[0];
      if (p.status !== 'paid') {
        throw new Error(`Cannot refund transaction with status '${p.status}'. Only settled payments can be refunded.`);
      }

      // 1. Update payment status
      await client.query(`
        UPDATE payments
        SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1;
      `, [paymentId]);

      // 2. Insert into refunds table
      const refundRes = await client.query(`
        INSERT INTO refunds (payment_id, amount, reason, provider_refund_id, status, created_at)
        VALUES ($1, $2, $3, $4, 'processed', CURRENT_TIMESTAMP)
        RETURNING id, amount, reason, status, created_at;
      `, [paymentId, p.amount, reason, `rfnd_${p.provider_payment_id || p.payment_code}`]);

      // 3. Record in admin_audit_log
      await client.query(`
        INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, result, ip, user_agent, details)
        VALUES ($1, 'refund_issued', 'payment', $2, 'success', $3, $4, $5);
      `, [
        adminId || null,
        String(paymentId),
        ip,
        userAgent,
        JSON.stringify({
          payment_code: p.payment_code,
          refund_amount: p.amount,
          reason
        })
      ]);

      await client.query('COMMIT');

      return {
        success: true,
        refund: refundRes.rows[0]
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
