import { pool } from '../../config/db.js';
import { ApprovalsService, maskPhone, maskEmail, formatToIST } from '../verification/approvalsService.js';

// Indian States and Major Cities Dictionary for Geographic Normalization
const KNOWN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Chandigarh', 'Puducherry'
];

const KNOWN_CITIES = [
  { city: 'Bengaluru', aliases: ['bengaluru', 'bangalore', 'blr'], state: 'Karnataka' },
  { city: 'Mumbai', aliases: ['mumbai', 'bombay'], state: 'Maharashtra' },
  { city: 'Delhi', aliases: ['new delhi', 'delhi', 'ncr'], state: 'Delhi' },
  { city: 'Hyderabad', aliases: ['hyderabad', 'secunderabad', 'hyd'], state: 'Telangana' },
  { city: 'Chennai', aliases: ['chennai', 'madras'], state: 'Tamil Nadu' },
  { city: 'Kolkata', aliases: ['kolkata', 'calcutta'], state: 'West Bengal' },
  { city: 'Pune', aliases: ['pune', 'poona'], state: 'Maharashtra' },
  { city: 'Noida', aliases: ['noida'], state: 'Uttar Pradesh' },
  { city: 'Gurugram', aliases: ['gurugram', 'gurgaon'], state: 'Haryana' },
  { city: 'Ahmedabad', aliases: ['ahmedabad'], state: 'Gujarat' },
  { city: 'Jaipur', aliases: ['jaipur'], state: 'Rajasthan' },
  { city: 'Lucknow', aliases: ['lucknow'], state: 'Uttar Pradesh' },
  { city: 'Chandigarh', aliases: ['chandigarh'], state: 'Chandigarh' },
  { city: 'Kochi', aliases: ['kochi', 'cochin'], state: 'Kerala' },

  { city: 'Coimbatore', aliases: ['coimbatore', 'kovai'], state: 'Tamil Nadu' },
  { city: 'Madurai', aliases: ['madurai'], state: 'Tamil Nadu' },
  { city: 'Indore', aliases: ['indore'], state: 'Madhya Pradesh' }
];

/**
 * Extracts city and state from an Indian address string.
 */
export function extractCityAndState(address) {
  if (!address || typeof address !== 'string') {
    return { city: 'Unspecified', state: 'Unspecified', location: 'Unspecified' };
  }

  const lower = address.toLowerCase();

  // 1. Detect City
  let detectedCity = 'Other';
  let inferredState = null;

  for (const entry of KNOWN_CITIES) {
    if (entry.aliases.some((alias) => lower.includes(alias))) {
      detectedCity = entry.city;
      inferredState = entry.state;
      break;
    }
  }

  // 2. Detect State
  let detectedState = inferredState || 'Other';
  for (const state of KNOWN_STATES) {
    if (lower.includes(state.toLowerCase())) {
      detectedState = state;
      break;
    }
  }

  const location = detectedCity !== 'Other' && detectedState !== 'Other'
    ? `${detectedCity}, ${detectedState}`
    : (detectedCity !== 'Other' ? detectedCity : (detectedState !== 'Other' ? detectedState : 'Unspecified'));

  return { city: detectedCity, state: detectedState, location };
}

/**
 * Computes SQL date filter and parameters in Asia/Kolkata timezone.
 */
function getDateCondition(range, customFrom, customTo, column = 'created_at', paramStartIndex = 1) {
  const values = [];
  let clause = '1=1';

  if (range === 'today') {
    clause = `(${column} AT TIME ZONE 'Asia/Kolkata')::DATE = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE`;
  } else if (range === 'yesterday') {
    clause = `(${column} AT TIME ZONE 'Asia/Kolkata')::DATE = ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE - INTERVAL '1 day')::DATE`;
  } else if (range === '7d' || range === '7days') {
    clause = `${column} >= CURRENT_TIMESTAMP - INTERVAL '7 days'`;
  } else if (range === '30d' || range === '30days') {
    clause = `${column} >= CURRENT_TIMESTAMP - INTERVAL '30 days'`;
  } else if (range === 'custom' && customFrom && customTo) {
    values.push(`${customFrom} 00:00:00+05:30`);
    values.push(`${customTo} 23:59:59+05:30`);
    clause = `${column} >= $${paramStartIndex} AND ${column} <= $${paramStartIndex + 1}`;
  }

  return { clause, values };
}

export class AnalyticsService {
  /**
   * 1. Overview Dashboard Analytics
   */
  static async getOverviewAnalytics({ range = '7d', from = null, to = null } = {}) {
    // 1. Customer counts
    const custRes = await pool.query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::DATE = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE)::int AS today,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::DATE = ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE - INTERVAL '1 day')::DATE)::int AS yesterday,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days')::int AS last_7d,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days')::int AS last_30d,
        COUNT(*) FILTER (WHERE COALESCE(account_status, 'active') = 'active')::int AS active,
        COUNT(*) FILTER (WHERE account_status IN ('suspended', 'inactive', 'blocked'))::int AS inactive
      FROM customers;
    `);

    // 2. Professional counts
    const proRes = await pool.query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::DATE = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE)::int AS today,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::DATE = ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE - INTERVAL '1 day')::DATE)::int AS yesterday,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days')::int AS last_7d,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days')::int AS last_30d,
        COUNT(*) FILTER (WHERE COALESCE(kyc_status, 'pending') = 'verified' OR account_status = 'active')::int AS verified,
        COUNT(*) FILTER (WHERE COALESCE(kyc_status, 'pending') IN ('pending', 'under_review', 'not_uploaded'))::int AS pending,
        COUNT(*) FILTER (WHERE kyc_status = 'rejected')::int AS rejected,
        COUNT(*) FILTER (WHERE account_status IN ('suspended', 'blocked') OR is_blocked = true)::int AS suspended,
        COUNT(*) FILTER (WHERE is_online = true)::int AS online_now
      FROM professionals;
    `);

    // 3. Service Requests / Work Order volume
    const srRes = await pool.query(`
      SELECT 
        COUNT(*)::int AS total_requests,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_requests,
        COUNT(*) FILTER (WHERE status IN ('open', 'request_received', 'pending', 'quoted', 'quoting', 'confirmed', 'accepted', 'en_route', 'on_the_way', 'arrived', 'in_progress'))::int AS active_requests,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_requests
      FROM service_requests;
    `);

    // 4. Combined registration timeline (last 7 or 30 days)
    const daysLimit = range === '30d' || range === '30days' ? 30 : 7;
    const timelineRes = await pool.query(`
      WITH date_series AS (
        SELECT (CURRENT_DATE - (n || ' days')::interval)::date AS day
        FROM generate_series(0, $1 - 1) n
      ),
      daily_cust AS (
        SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS cust_count
        FROM customers
        WHERE created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::interval
        GROUP BY 1
      ),
      daily_pro AS (
        SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS pro_count
        FROM professionals
        WHERE created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::interval
        GROUP BY 1
      )
      SELECT 
        TO_CHAR(ds.day, 'YYYY-MM-DD') AS date_str,
        TO_CHAR(ds.day, 'DD Mon') AS display_date,
        COALESCE(dc.cust_count, 0) AS customers,
        COALESCE(dp.pro_count, 0) AS professionals
      FROM date_series ds
      LEFT JOIN daily_cust dc ON dc.day = ds.day
      LEFT JOIN daily_pro dp ON dp.day = ds.day
      ORDER BY ds.day ASC;
    `, [daysLimit]);

    // 5. Category breakdown
    const categoryRes = await pool.query(`
      SELECT 
        COALESCE(sc.name, p.trade, 'Other') AS category_name,
        COUNT(DISTINCT p.id)::int AS professional_count,
        COUNT(DISTINCT sr.id)::int AS request_count
      FROM professionals p
      LEFT JOIN service_categories sc ON sc.id = p.trade_id OR LOWER(sc.slug) = LOWER(p.trade)
      LEFT JOIN service_requests sr ON LOWER(sr.category) = LOWER(p.trade) OR sr.assigned_professional_id = p.id
      GROUP BY 1
      ORDER BY professional_count DESC, request_count DESC
      LIMIT 6;
    `);

    return {
      customers: custRes.rows[0],
      professionals: proRes.rows[0],
      bookings: srRes.rows[0],
      timeline: timelineRes.rows,
      categories: categoryRes.rows,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 2. Customer Analytics (Dedicated)
   */
  static async getCustomerAnalytics({ range = '7d', from = null, to = null } = {}) {
    const { clause, values } = getDateCondition(range, from, to, 'c.created_at', 1);

    // Headline metrics
    const statsRes = await pool.query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::DATE = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE)::int AS today,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::DATE = ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE - INTERVAL '1 day')::DATE)::int AS yesterday,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days')::int AS last_7d,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days')::int AS last_30d,
        COUNT(*) FILTER (WHERE COALESCE(account_status, 'active') = 'active')::int AS active,
        COUNT(*) FILTER (WHERE account_status IN ('suspended', 'inactive', 'blocked'))::int AS inactive
      FROM customers;
    `);

    // Registration trend chart points
    const daysLimit = range === '30d' || range === '30days' ? 30 : 7;
    const trendRes = await pool.query(`
      WITH date_series AS (
        SELECT (CURRENT_DATE - (n || ' days')::interval)::date AS day
        FROM generate_series(0, $1 - 1) n
      ),
      daily AS (
        SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS count
        FROM customers
        WHERE created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::interval
        GROUP BY 1
      )
      SELECT 
        TO_CHAR(ds.day, 'YYYY-MM-DD') AS date_str,
        TO_CHAR(ds.day, 'DD Mon') AS display_date,
        COALESCE(d.count, 0) AS count
      FROM date_series ds
      LEFT JOIN daily d ON d.day = ds.day
      ORDER BY ds.day ASC;
    `, [daysLimit]);

    // Most active customers by actual service request booking volume
    const mostActiveRes = await pool.query(`
      SELECT 
        c.id, c.customer_code, c.name, c.email, c.phone, c.created_at,
        c.account_status,
        COUNT(sr.id)::int AS total_bookings,
        COUNT(sr.id) FILTER (WHERE sr.status = 'completed')::int AS completed_bookings,
        MAX(sr.created_at) AS last_booking_at
      FROM customers c
      LEFT JOIN service_requests sr ON sr.customer_id = c.id
      GROUP BY c.id
      ORDER BY total_bookings DESC, completed_bookings DESC, c.created_at DESC
      LIMIT 8;
    `);

    const mostActive = mostActiveRes.rows.map((row) => ({
      id: row.id,
      customerCode: row.customer_code || String(row.id),
      name: row.name || 'Anonymous Customer',
      email: row.email || '',
      phone: row.phone || '',
      maskedEmail: row.email || '',
      maskedPhone: row.phone || '',
      totalBookings: row.total_bookings,
      completedBookings: row.completed_bookings,
      lastActiveFormatted: row.last_booking_at ? formatToIST(row.last_booking_at) : formatToIST(row.created_at),
      accountStatus: row.account_status || 'active'
    }));

    // Top service demand locations (from service_requests addresses)
    const demandLocationsRes = await pool.query(`
      SELECT 
        COALESCE(NULLIF(sr.user_address, ''), 'Unspecified') AS raw_address,
        COUNT(sr.id)::int AS request_count,
        COUNT(sr.id) FILTER (WHERE sr.status = 'completed')::int AS completed_count
      FROM service_requests sr
      WHERE ${clause.replace(/c\.created_at/g, 'sr.created_at')}
      GROUP BY 1
      ORDER BY request_count DESC
      LIMIT 15;
    `, values);

    // Geographic state and city distribution parsed from customer addresses
    const allAddressesRes = await pool.query(`
      SELECT permanent_address, created_at FROM customers;
    `);

    const stateCountMap = new Map();
    const cityCountMap = new Map();

    allAddressesRes.rows.forEach((row) => {
      const { city, state } = extractCityAndState(row.permanent_address);
      stateCountMap.set(state, (stateCountMap.get(state) || 0) + 1);
      cityCountMap.set(city, (cityCountMap.get(city) || 0) + 1);
    });

    const totalAddresses = allAddressesRes.rows.length || 1;

    const stateDistribution = Array.from(stateCountMap.entries())
      .map(([state, count]) => ({
        state,
        count,
        percentage: Math.round((count / totalAddresses) * 100)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const cityDistribution = Array.from(cityCountMap.entries())
      .map(([city, count]) => ({
        city,
        count,
        percentage: Math.round((count / totalAddresses) * 100)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Top demand location items normalized
    const topLocations = demandLocationsRes.rows.slice(0, 6).map((r) => {
      const { city, state } = extractCityAndState(r.raw_address);
      return {
        location: city !== 'Other' ? `${city}, ${state}` : r.raw_address.slice(0, 32),
        requestCount: r.request_count,
        completedCount: r.completed_count
      };
    });

    // Recent registrations
    const recentRes = await pool.query(`
      SELECT id, customer_code, name, email, phone, created_at, permanent_address, account_status
      FROM customers
      ORDER BY created_at DESC
      LIMIT 8;
    `);

    const recentRegistrations = recentRes.rows.map((row) => ({
      id: row.id,
      customerCode: row.customer_code || String(row.id),
      name: row.name || 'Anonymous Customer',
      email: row.email || '',
      phone: row.phone || '',
      maskedEmail: row.email || '',
      maskedPhone: row.phone || '',
      location: extractCityAndState(row.permanent_address).city,
      accountStatus: row.account_status || 'active',
      registeredAtFormatted: formatToIST(row.created_at)
    }));

    // -------------------------------------------------------------------------
    // Customers by Service Category Breakdown
    // -------------------------------------------------------------------------
    const serviceDemandRes = await pool.query(`
      SELECT 
        COALESCE(NULLIF(TRIM(sr.category), ''), 'General Maintenance') AS category,
        COUNT(DISTINCT sr.customer_id)::int AS unique_customers,
        COUNT(sr.id)::int AS total_bookings,
        COUNT(sr.id) FILTER (WHERE sr.status = 'completed')::int AS completed_bookings,
        COUNT(sr.id) FILTER (WHERE sr.status IN ('in_progress', 'assigned', 'on_the_way', 'arrived', 'confirmed'))::int AS in_progress_bookings,
        COUNT(sr.id) FILTER (WHERE sr.status = 'cancelled')::int AS cancelled_bookings,
        MAX(sr.created_at) AS latest_booking_at
      FROM service_requests sr
      GROUP BY 1
      ORDER BY unique_customers DESC, total_bookings DESC;
    `);

    const uniqueWithBookingRes = await pool.query(`
      SELECT COUNT(DISTINCT customer_id)::int AS count FROM service_requests;
    `);
    const totalCustomersWithBookings = uniqueWithBookingRes.rows[0]?.count || 0;
    const totalRegisteredCustomers = statsRes.rows[0]?.total || 0;
    const customersWithoutBookings = Math.max(0, totalRegisteredCustomers - totalCustomersWithBookings);

    const customersByServiceCategories = await Promise.all(
      serviceDemandRes.rows.map(async (row) => {
        const locRes = await pool.query(`
          SELECT user_address FROM service_requests 
          WHERE LOWER(COALESCE(NULLIF(TRIM(category), ''), 'General Maintenance')) = LOWER($1)
          LIMIT 50;
        `, [row.category]);

        const catCityMap = new Map();
        locRes.rows.forEach(r => {
          const { city } = extractCityAndState(r.user_address);
          catCityMap.set(city, (catCityMap.get(city) || 0) + 1);
        });

        const topCities = Array.from(catCityMap.entries())
          .map(([city, count]) => ({ city, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        const sampleCustRes = await pool.query(`
          SELECT 
            c.id, c.customer_code, c.name, c.email, c.phone, c.permanent_address,
            COUNT(sr.id)::int AS category_bookings,
            MAX(sr.created_at) AS last_booking
          FROM customers c
          JOIN service_requests sr ON sr.customer_id = c.id
          WHERE LOWER(COALESCE(NULLIF(TRIM(sr.category), ''), 'General Maintenance')) = LOWER($1)
          GROUP BY c.id
          ORDER BY category_bookings DESC, last_booking DESC
          LIMIT 5;
        `, [row.category]);

        const sampleCustomers = sampleCustRes.rows.map(c => ({
          id: c.id,
          customerCode: c.customer_code || String(c.id),
          name: c.name || 'Anonymous Customer',
          phone: c.phone || '',
          maskedPhone: c.phone || '',
          location: extractCityAndState(c.permanent_address).city,
          categoryBookings: c.category_bookings,
          lastBookingFormatted: formatToIST(c.last_booking)
        }));

        const pct = totalCustomersWithBookings > 0
          ? Math.round((row.unique_customers / totalCustomersWithBookings) * 100)
          : 0;

        return {
          category: row.category,
          uniqueCustomers: row.unique_customers,
          totalBookings: row.total_bookings,
          completedBookings: row.completed_bookings,
          inProgressBookings: row.in_progress_bookings,
          cancelledBookings: row.cancelled_bookings,
          percentage: pct,
          topCities,
          sampleCustomers
        };
      })
    );

    const customersByService = {
      totalUniqueCustomers: totalRegisteredCustomers,
      customersWithBookings: totalCustomersWithBookings,
      customersWithoutBookings,
      categories: customersByServiceCategories
    };

    return {
      summary: statsRes.rows[0],
      trend: trendRes.rows,
      stateDistribution,
      cityDistribution,
      topDemandLocations: topLocations,
      mostActiveCustomers: mostActive,
      recentRegistrations,
      customersByService,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 3. Professional Analytics (Dedicated)
   */
  static async getProfessionalAnalytics({ range = '7d', from = null, to = null } = {}) {
    // Headline metrics
    const statsRes = await pool.query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::DATE = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE)::int AS today,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::DATE = ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE - INTERVAL '1 day')::DATE)::int AS yesterday,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days')::int AS last_7d,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days')::int AS last_30d,
        COUNT(*) FILTER (WHERE COALESCE(kyc_status, 'pending') = 'verified' OR account_status = 'active')::int AS verified,
        COUNT(*) FILTER (WHERE COALESCE(kyc_status, 'pending') IN ('pending', 'under_review', 'not_uploaded'))::int AS pending,
        COUNT(*) FILTER (WHERE kyc_status = 'rejected')::int AS rejected,
        COUNT(*) FILTER (WHERE account_status IN ('suspended', 'blocked') OR is_blocked = true)::int AS suspended,
        COUNT(*) FILTER (WHERE is_online = true)::int AS online_now
      FROM professionals;
    `);

    // Registration trend points
    const daysLimit = range === '30d' || range === '30days' ? 30 : 7;
    const trendRes = await pool.query(`
      WITH date_series AS (
        SELECT (CURRENT_DATE - (n || ' days')::interval)::date AS day
        FROM generate_series(0, $1 - 1) n
      ),
      daily_reg AS (
        SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS count
        FROM professionals
        WHERE created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::interval
        GROUP BY 1
      ),
      daily_verified AS (
        SELECT (decided_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS count
        FROM verification_requests
        WHERE status = 'approved' AND decided_at >= CURRENT_TIMESTAMP - ($1 || ' days')::interval
        GROUP BY 1
      ),
      daily_rejected AS (
        SELECT (decided_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS count
        FROM verification_requests
        WHERE status = 'rejected' AND decided_at >= CURRENT_TIMESTAMP - ($1 || ' days')::interval
        GROUP BY 1
      )
      SELECT 
        TO_CHAR(ds.day, 'YYYY-MM-DD') AS date_str,
        TO_CHAR(ds.day, 'DD Mon') AS display_date,
        COALESCE(dr.count, 0) AS registrations,
        COALESCE(dv.count, 0) AS approvals,
        COALESCE(dj.count, 0) AS rejections
      FROM date_series ds
      LEFT JOIN daily_reg dr ON dr.day = ds.day
      LEFT JOIN daily_verified dv ON dv.day = ds.day
      LEFT JOIN daily_rejected dj ON dj.day = ds.day
      ORDER BY ds.day ASC;
    `, [daysLimit]);

    // Most demanded professional categories
    const categoryDemandRes = await pool.query(`
      SELECT 
        COALESCE(p.trade, 'General') AS trade,
        COUNT(DISTINCT p.id)::int AS professional_count,
        COUNT(DISTINCT sr.id)::int AS total_requests,
        COUNT(DISTINCT sr.id) FILTER (WHERE sr.status = 'completed')::int AS completed_jobs
      FROM professionals p
      LEFT JOIN service_requests sr ON LOWER(sr.category) = LOWER(p.trade) OR sr.assigned_professional_id = p.id
      GROUP BY 1
      ORDER BY total_requests DESC, professional_count DESC
      LIMIT 8;
    `);

    // Most active professionals
    const mostActiveRes = await pool.query(`
      SELECT 
        p.id, p.professional_code, p.name, p.trade, p.rating, p.completed_jobs,
        p.is_online, p.kyc_status, p.account_status,
        COUNT(sr.id) FILTER (WHERE sr.status = 'completed')::int AS actual_completed_orders
      FROM professionals p
      LEFT JOIN service_requests sr ON sr.assigned_professional_id = p.id
      GROUP BY p.id
      ORDER BY actual_completed_orders DESC, p.completed_jobs DESC, p.rating DESC
      LIMIT 8;
    `);

    const mostActive = mostActiveRes.rows.map((row) => ({
      id: row.id,
      professionalCode: row.professional_code || String(row.id),
      name: row.name,
      trade: row.trade || 'General Maintenance',
      rating: (row.rating !== null && row.rating !== undefined) ? parseFloat(row.rating).toFixed(1) : null,
      completedJobs: Math.max(row.completed_jobs || 0, row.actual_completed_orders || 0),
      isOnline: Boolean(row.is_online),
      kycStatus: row.kyc_status || 'pending',
      accountStatus: row.account_status || 'active'
    }));

    // Geographic professional distribution
    const allAddressesRes = await pool.query(`
      SELECT COALESCE(permanent_address, address, current_locality) AS addr FROM professionals;
    `);

    const stateCountMap = new Map();
    const cityCountMap = new Map();

    allAddressesRes.rows.forEach((row) => {
      const { city, state } = extractCityAndState(row.addr);
      stateCountMap.set(state, (stateCountMap.get(state) || 0) + 1);
      cityCountMap.set(city, (cityCountMap.get(city) || 0) + 1);
    });

    const totalAddresses = allAddressesRes.rows.length || 1;

    const stateDistribution = Array.from(stateCountMap.entries())
      .map(([state, count]) => ({
        state,
        count,
        percentage: Math.round((count / totalAddresses) * 100)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const cityDistribution = Array.from(cityCountMap.entries())
      .map(([city, count]) => ({
        city,
        count,
        percentage: Math.round((count / totalAddresses) * 100)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Recent professional registrations & verification status
    const recentRes = await pool.query(`
      SELECT 
        p.id, p.professional_code, p.name, p.trade, p.email, p.phone,
        p.kyc_status, p.account_status, p.created_at, p.permanent_address,
        vr.status AS queue_status, vr.queued_at
      FROM professionals p
      LEFT JOIN verification_requests vr ON vr.professional_id = p.id
      ORDER BY p.created_at DESC
      LIMIT 8;
    `);

    const recentRegistrations = recentRes.rows.map((row) => ({
      id: row.id,
      professionalCode: row.professional_code || String(row.id),
      name: row.name,
      trade: row.trade || 'General Maintenance',
      email: row.email || '',
      phone: row.phone || '',
      maskedEmail: row.email || '',
      maskedPhone: row.phone || '',
      location: extractCityAndState(row.permanent_address).city,
      kycStatus: row.queue_status || row.kyc_status || 'pending',
      accountStatus: row.account_status || 'pending',
      registeredAtFormatted: formatToIST(row.created_at)
    }));

    // -------------------------------------------------------------------------
    // Professionals by Trade Breakdown
    // -------------------------------------------------------------------------
    const tradeRes = await pool.query(`
      SELECT 
        COALESCE(NULLIF(TRIM(p.trade), ''), 'General Maintenance') AS trade,
        COUNT(p.id)::int AS total_pros,
        COUNT(p.id) FILTER (WHERE COALESCE(p.kyc_status, 'pending') = 'verified' OR p.account_status = 'active')::int AS verified,
        COUNT(p.id) FILTER (WHERE COALESCE(p.kyc_status, 'pending') IN ('pending', 'under_review', 'not_uploaded'))::int AS pending,
        COUNT(p.id) FILTER (WHERE p.kyc_status = 'rejected')::int AS rejected,
        COUNT(p.id) FILTER (WHERE p.account_status = 'active')::int AS active,
        COUNT(p.id) FILTER (WHERE p.is_online = true)::int AS online_now,
        COUNT(p.id) FILTER (WHERE p.account_status != 'active' OR p.is_online = false)::int AS inactive,
        COALESCE(SUM(p.completed_jobs), 0)::int AS completed_jobs,
        COALESCE(ROUND(AVG(p.rating)::numeric, 1), 0.0) AS avg_rating
      FROM professionals p
      GROUP BY 1
      ORDER BY total_pros DESC;
    `);

    const proDemandRes = await pool.query(`
      SELECT 
        COALESCE(NULLIF(TRIM(category), ''), 'General Maintenance') AS cat,
        COUNT(id)::int AS demand_count
      FROM service_requests
      GROUP BY 1;
    `);
    const demandMap = new Map();
    proDemandRes.rows.forEach(r => demandMap.set(r.cat.toLowerCase(), r.demand_count));

    const totalUniquePros = statsRes.rows[0]?.total || 0;

    const professionalsByTradeList = await Promise.all(
      tradeRes.rows.map(async (row) => {
        const demandCount = demandMap.get(row.trade.toLowerCase()) || 0;

        const locRes = await pool.query(`
          SELECT COALESCE(permanent_address, address) AS addr FROM professionals 
          WHERE LOWER(COALESCE(NULLIF(TRIM(trade), ''), 'General Maintenance')) = LOWER($1)
          LIMIT 50;
        `, [row.trade]);

        const tradeCityMap = new Map();
        locRes.rows.forEach(r => {
          const { city } = extractCityAndState(r.addr);
          tradeCityMap.set(city, (tradeCityMap.get(city) || 0) + 1);
        });

        const topCities = Array.from(tradeCityMap.entries())
          .map(([city, count]) => ({ city, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        const sampleProRes = await pool.query(`
          SELECT id, professional_code, name, rating, completed_jobs, is_online, kyc_status, permanent_address
          FROM professionals
          WHERE LOWER(COALESCE(NULLIF(TRIM(trade), ''), 'General Maintenance')) = LOWER($1)
          ORDER BY completed_jobs DESC, rating DESC
          LIMIT 5;
        `, [row.trade]);

        const samplePros = sampleProRes.rows.map(p => ({
          id: p.id,
          code: p.professional_code || String(p.id),
          name: p.name,
          rating: (p.rating !== null && p.rating !== undefined) ? parseFloat(p.rating).toFixed(1) : null,
          completedJobs: p.completed_jobs || 0,
          isOnline: Boolean(p.is_online),
          kycStatus: p.kyc_status || 'pending',
          location: extractCityAndState(p.permanent_address).city
        }));

        const pct = totalUniquePros > 0 ? Math.round((row.total_pros / totalUniquePros) * 100) : 0;

        return {
          trade: row.trade,
          totalPros: row.total_pros,
          verified: row.verified,
          pending: row.pending,
          rejected: row.rejected,
          active: row.active,
          onlineNow: row.online_now,
          inactive: row.inactive,
          completedJobs: row.completed_jobs,
          avgRating: row.avg_rating,
          serviceDemand: demandCount,
          percentage: pct,
          topCities,
          samplePros
        };
      })
    );

    const professionalsByTrade = {
      totalUniqueProfessionals: totalUniquePros,
      trades: professionalsByTradeList
    };

    return {
      summary: statsRes.rows[0],
      trend: trendRes.rows,
      categories: categoryDemandRes.rows,
      mostActiveProfessionals: mostActive,
      stateDistribution,
      cityDistribution,
      recentRegistrations,
      professionalsByTrade,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 4. Full Professional Registry (Search, filter, paginate, sort)
   */
  static async getProfessionalRegistry({
    search = '',
    trade = 'all',
    status = 'all',
    sort = 'newest',
    page = 1,
    limit = 20
  } = {}) {
    const conditions = ['1=1'];
    const values = [];

    // Search filter
    if (search && search.trim()) {
      values.push(`%${search.trim().toLowerCase()}%`);
      const sIdx = values.length;
      conditions.push(`(
        LOWER(p.name) LIKE $${sIdx}
        OR LOWER(p.professional_code) LIKE $${sIdx}
        OR LOWER(p.email) LIKE $${sIdx}
        OR p.phone LIKE $${sIdx}
        OR LOWER(p.trade) LIKE $${sIdx}
      )`);
    }

    // Trade filter
    if (trade && trade !== 'all') {
      values.push(trade);
      conditions.push(`LOWER(p.trade) = LOWER($${values.length})`);
    }

    // Status filter
    if (status === 'all') {
      // Explicit 'all' request: include all records
    } else if (status === 'pending') {
      conditions.push(`(COALESCE(p.kyc_status, 'pending') IN ('pending', 'under_review', 'not_uploaded'))`);
    } else if (status === 'rejected') {
      conditions.push(`p.kyc_status = 'rejected'`);
    } else if (status === 'suspended') {
      conditions.push(`(p.account_status IN ('suspended', 'blocked') OR p.is_blocked = true)`);
    } else if (status === 'online') {
      conditions.push(`p.is_online = true AND p.kyc_status = 'verified'`);
    } else {
      // Default (and when status === 'verified' or status === 'active'):
      // ONLY approved & verified professionals appear in the Professionals directory.
      // Unapproved applicants stay in the Approvals queue until approved by an admin.
      conditions.push(`p.kyc_status = 'verified'`);
    }

    // Sorting
    let orderClause = 'ORDER BY p.created_at DESC';
    if (sort === 'oldest') orderClause = 'ORDER BY p.created_at ASC';
    else if (sort === 'name') orderClause = 'ORDER BY p.name ASC';
    else if (sort === 'rating') orderClause = 'ORDER BY p.rating DESC, p.completed_jobs DESC';
    else if (sort === 'completed_jobs') orderClause = 'ORDER BY p.completed_jobs DESC';

    // Total count
    const countRes = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM professionals p
      WHERE ${conditions.join(' AND ')};
    `, values);

    const total = countRes.rows[0]?.total || 0;
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(5, parseInt(limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;

    values.push(safeLimit);
    const limitIdx = values.length;
    values.push(offset);
    const offsetIdx = values.length;

    const listRes = await pool.query(`
      SELECT 
        p.id, p.professional_code, p.name, p.trade, p.email, p.phone,
        p.experience_years, p.rating, p.completed_jobs, p.is_online,
        p.availability_status, p.kyc_status, p.account_status,
        p.permanent_address, p.created_at,
        COUNT(sr.id) FILTER (WHERE sr.status = 'completed')::int AS orders_completed,
        MAX(ph.id) AS photo_id
      FROM professionals p
      LEFT JOIN service_requests sr ON sr.assigned_professional_id = p.id
      LEFT JOIN professional_photos ph ON ph.professional_id = p.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY p.id
      ${orderClause}
      LIMIT $${limitIdx} OFFSET $${offsetIdx};
    `, values);

    // Dynamic distinct trades list from database
    const tradeRows = await pool.query(`
      SELECT DISTINCT COALESCE(NULLIF(TRIM(trade), ''), 'General Maintenance') AS trade_name
      FROM professionals
      ORDER BY trade_name ASC;
    `);
    const availableTrades = tradeRows.rows.map(r => r.trade_name);

    const professionals = listRes.rows.map((row) => {
      const geo = extractCityAndState(row.permanent_address);
      const displayCity = geo.city !== 'Other' ? geo.city : 'Tiruchirappalli';
      const displayState = geo.state !== 'Other' ? geo.state : 'Tamil Nadu';
      const displayLocation = `${displayCity}, ${displayState}`;

      return {
        id: row.id,
        professionalCode: row.professional_code || String(row.id),
        name: row.name,
        trade: row.trade || 'General Maintenance',
        email: row.email || '',
        phone: row.phone || '',
        maskedEmail: row.email || '',
        maskedPhone: row.phone || '',
        experienceYears: row.experience_years !== null && row.experience_years !== undefined ? row.experience_years : (row.years_of_experience || 0),
        rating: (row.rating !== null && row.rating !== undefined) ? parseFloat(row.rating).toFixed(1) : null,
        completedJobs: Math.max(row.completed_jobs || 0, row.orders_completed || 0),
        isOnline: Boolean(row.is_online),
        availabilityStatus: row.availability_status || 'offline',
        kycStatus: row.kyc_status || 'pending',
        accountStatus: row.account_status || 'active',
        status: row.account_status || 'active',
        city: displayCity,
        state: displayState,
        location: displayLocation,
        fullAddress: row.permanent_address || 'Not provided',
        avatarUrl: row.photo_id ? `/api/verification/photo/stream?id=${row.id}&v=${row.photo_updated_at ? new Date(row.photo_updated_at).getTime() : Date.now()}` : null,
        joinedDateFormatted: formatToIST(row.created_at),
        registeredAtFormatted: formatToIST(row.created_at)
      };
    });

    return {
      professionals,
      availableTrades,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1
      }
    };
  }

  /**
   * 5. Professional Profile Details
   */
  static async getProfessionalProfile(proId, adminUser) {
    const res = await pool.query(`
      SELECT 
        p.*,
        COALESCE(a.is_phone_verified, false) AS mobile_verified
      FROM professionals p
      LEFT JOIN agent_login a ON a.id = p.id OR a.email = p.email
      WHERE p.id::text = $1::text OR p.professional_code = $1::text LIMIT 1;
    `, [String(proId)]);

    if (res.rows.length === 0) return null;
    const p = res.rows[0];
    const realProId = p.id;

    // Documents (strictly last 4 digits only, NO 12-digit numbers)
    const docsRes = await pool.query(`
      SELECT id, document_type, status, mime_type, aadhaar_last4, document_expiry, checks, created_at, reviewed_by, reviewed_at
      FROM professional_documents
      WHERE professional_id = $1;
    `, [realProId]);

    // Live Photo
    const photoRes = await pool.query(`
      SELECT id, status, face_similarity_score, checks, is_upload_fallback, created_at, reviewed_by, reviewed_at
      FROM professional_photos
      WHERE professional_id = $1 LIMIT 1;
    `, [realProId]);

    // Verification requests and timeline
    const eventsRes = await pool.query(`
      SELECT ve.*, au.username AS admin_name
      FROM verification_events ve
      LEFT JOIN admin_users au ON au.id = ve.actor_id AND ve.actor_type = 'admin'
      WHERE ve.request_id IN (SELECT id FROM verification_requests WHERE professional_id = $1)
      ORDER BY ve.created_at DESC LIMIT 20;
    `, [realProId]);

    // Real service requests activity counts
    const countsRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE LOWER(status) = 'completed') AS completed_count,
        COUNT(*) FILTER (WHERE LOWER(status) IN ('cancelled', 'canceled')) AS cancelled_count,
        COUNT(*) FILTER (WHERE LOWER(status) IN ('in_progress', 'accepted', 'en_route', 'otp_verified', 'started')) AS in_progress_count
      FROM service_requests
      WHERE assigned_professional_id = $1 OR id IN (
        SELECT sr.id FROM service_requests sr JOIN quotes q ON q.request_id = sr.id WHERE q.agent_id = $1
      );
    `, [realProId]);

    const completedJobsCount = parseInt(countsRes.rows[0]?.completed_count, 10) || p.completed_jobs || 0;
    const cancelledJobsCount = parseInt(countsRes.rows[0]?.cancelled_count, 10) || 0;
    const inProgressJobsCount = parseInt(countsRes.rows[0]?.in_progress_count, 10) || 0;

    // Mobile verification record check
    const mobileVerifRes = await pool.query(`
      SELECT verified_at FROM otp_verifications 
      WHERE identifier = $1 OR identifier = $2
      ORDER BY id DESC LIMIT 1;
    `, [p.phone, `+91${(p.phone || '').replace(/\D/g, '')}`]);
    const mobileVerifiedAt = mobileVerifRes.rows[0]?.verified_at
      ? formatToIST(mobileVerifRes.rows[0].verified_at)
      : (p.mobile_verified ? formatToIST(p.created_at) : null);

    // Last seen timestamp
    const lastSeenRes = await pool.query(`
      SELECT location_updated_at FROM agent_login WHERE id = $1 OR email = $2 LIMIT 1;
    `, [realProId, p.email]);
    const lastSeenAt = lastSeenRes.rows[0]?.location_updated_at;
    const lastSeenFormatted = lastSeenAt ? formatToIST(lastSeenAt) : (p.is_online ? 'Just now' : '—');

    // Admin users lookup map
    const adminQuery = await pool.query('SELECT id, username FROM admin_users;');
    const adminMap = new Map(adminQuery.rows.map(a => [String(a.id), a.username]));

    // Latest verification request
    const latestReqRes = await pool.query(`
      SELECT id, status, decision_note, first_submitted_at, queued_at
      FROM verification_requests
      WHERE professional_id = $1
      ORDER BY id DESC LIMIT 1;
    `, [realProId]);
    const latestReq = latestReqRes.rows[0] || null;

    const admin = adminUser || { id: 1 };
    const documents = await Promise.all(docsRes.rows.map(async (d) => {
      let viewUrl = null;
      try {
        viewUrl = await ApprovalsService.createDocumentViewUrl(d.id, 'document', admin);
      } catch (_) {
        viewUrl = `/admin/documents/view/document-${d.id}`;
      }
      return {
        id: d.id,
        type: d.document_type,
        status: d.status,
        last4: d.aadhaar_last4 || null,
        maskedAadhaar: d.aadhaar_last4 ? `XXXX XXXX ${d.aadhaar_last4}` : null,
        documentExpiry: d.document_expiry,
        checks: d.checks || {},
        reviewedBy: adminMap.get(String(d.reviewed_by)) || d.reviewed_by || null,
        reviewedAt: d.reviewed_at ? formatToIST(d.reviewed_at) : null,
        mimeType: d.mime_type,
        viewUrl,
        uploadedAt: formatToIST(d.created_at)
      };
    }));

    let photoViewUrl = null;
    const photoRow = photoRes.rows[0];
    if (photoRow) {
      try {
        photoViewUrl = await ApprovalsService.createDocumentViewUrl(photoRow.id, 'photo', admin);
      } catch (_) {
        photoViewUrl = `/api/verification/photo/stream?id=${proId}`;
      }
    }

    // Suspension and ban status query
    const suspRes = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM professional_suspensions WHERE professional_id = $1) AS suspension_count,
        (SELECT COUNT(*) FROM banned_professionals WHERE professional_id = $1) AS is_banned_record
    `, [realProId]);

    const suspensionCount = parseInt(suspRes.rows[0]?.suspension_count, 10) || 0;
    const isBanned = p.account_status === 'banned' || parseInt(suspRes.rows[0]?.is_banned_record, 10) > 0;
    const chancesRemaining = Math.max(0, 3 - suspensionCount);
    const isSuspended = p.account_status === 'suspended';
    const isCurrentlySuspended = Boolean(isSuspended && p.suspended_until && new Date(p.suspended_until) > new Date());
    const isSuspensionPeriodOver = Boolean(isSuspended && (!p.suspended_until || new Date(p.suspended_until) <= new Date()));

    const geo = extractCityAndState(p.permanent_address);
    const displayCity = geo.city !== 'Other' ? geo.city : 'Tiruchirappalli';
    const displayState = geo.state !== 'Other' ? geo.state : 'Tamil Nadu';

    return {
      id: p.id,
      professionalCode: p.professional_code || String(p.id),
      name: p.name,
      trade: p.trade ? p.trade.charAt(0).toUpperCase() + p.trade.slice(1).toLowerCase() : 'Professional',
      email: p.email || '',
      phone: p.phone || '',
      maskedEmail: p.email ? `${p.email.slice(0, 2)}••••••@••••.com` : '—',
      maskedPhone: p.phone ? `${p.phone.slice(0, 3)} ••••• ••••` : '—',
      experienceYears: p.experience_years !== null && p.experience_years !== undefined ? p.experience_years : (p.years_of_experience || 0),
      rating: (p.rating !== null && p.rating !== undefined) ? parseFloat(p.rating).toFixed(1) : null,
      completedJobs: completedJobsCount,
      cancelledJobs: cancelledJobsCount,
      inProgressJobs: inProgressJobsCount,
      isOnline: Boolean(p.is_online),
      lastSeenFormatted,
      mobileVerified: Boolean(p.mobile_verified),
      mobileVerifiedAt,
      kycStatus: p.kyc_status || 'pending',
      accountStatus: p.account_status || 'active',
      status: p.account_status || 'active',
      suspendedUntil: p.suspended_until,
      suspensionCount,
      suspensionAttempts: suspensionCount,
      chancesRemaining,
      isBanned,
      isSuspended,
      isCurrentlySuspended,
      isSuspensionPeriodOver,
      latestVerificationRequestId: latestReq ? latestReq.id : null,
      latestRequestStatus: latestReq ? latestReq.status : null,
      city: displayCity,
      state: displayState,
      area: displayCity,
      location: `${displayCity}, ${displayState}`,
      permanentAddress: p.permanent_address || 'Not provided',
      joinedDateFormatted: formatToIST(p.created_at),
      registeredAtFormatted: formatToIST(p.created_at),
      documents,
      photo: photoRow ? {
        id: photoRow.id,
        status: photoRow.status,
        faceScore: photoRow.face_similarity_score,
        isUploadFallback: Boolean(photoRow.is_upload_fallback),
        captureSource: photoRow.is_upload_fallback ? 'uploaded_file' : 'live_capture',
        checks: photoRow.checks || {},
        reviewedBy: adminMap.get(String(photoRow.reviewed_by)) || photoRow.reviewed_by || null,
        reviewedAt: photoRow.reviewed_at ? formatToIST(photoRow.reviewed_at) : null,
        uploadedAt: formatToIST(photoRow.created_at),
        url: `/api/verification/photo/stream?id=${realProId}&v=${photoRow.updated_at ? new Date(photoRow.updated_at).getTime() : Date.now()}`,
        viewUrl: photoViewUrl || `/api/verification/photo/stream?id=${realProId}&v=${photoRow.updated_at ? new Date(photoRow.updated_at).getTime() : Date.now()}`
      } : null,
      avatarUrl: (photoRow && (photoRow.status === 'verified' || photoRow.status === 'approved')) ? `/api/verification/photo/stream?id=${realProId}&v=${photoRow.updated_at ? new Date(photoRow.updated_at).getTime() : Date.now()}` : null,
      events: eventsRes.rows.map((ev) => ({
        type: ev.event_type,
        actor: ev.admin_name || ev.actor_type,
        dateFormatted: formatToIST(ev.created_at),
        details: ev.details || {}
      })),
      recentJobs: []
    };
  }

  /**
   * Single Customer Profile
   */
  static async getCustomerProfile(customerId, adminUser) {
    return ApprovalsService.getCustomerDetails(customerId, adminUser);
  }

  /**
   * 6. Full Customer Registry (Search, filter, paginate, sort)
   */
  static async getCustomerRegistry({
    search = '',
    category = 'all',
    status = 'all',
    sort = 'newest',
    page = 1,
    limit = 20
  } = {}) {
    const conditions = ['1=1'];
    const values = [];

    // Search filter
    if (search && search.trim()) {
      values.push(`%${search.trim().toLowerCase()}%`);
      const sIdx = values.length;
      conditions.push(`(
        LOWER(c.name) LIKE $${sIdx}
        OR LOWER(c.customer_code) LIKE $${sIdx}
        OR LOWER(c.email) LIKE $${sIdx}
        OR c.phone LIKE $${sIdx}
      )`);
    }

    // Category / Service filter
    if (category && category !== 'all' && category.trim()) {
      values.push(category.trim().toLowerCase());
      const cIdx = values.length;
      conditions.push(`(
        c.id IN (
          SELECT DISTINCT customer_id 
          FROM service_requests 
          WHERE LOWER(category) = $${cIdx} OR LOWER(service_title) LIKE '%' || $${cIdx} || '%'
        )
      )`);
    }

    // Status filter
    if (status && status !== 'all') {
      if (status === 'active') {
        conditions.push(`COALESCE(c.account_status, 'active') = 'active'`);
      } else if (status === 'suspended') {
        conditions.push(`c.account_status IN ('suspended', 'blocked', 'inactive')`);
      } else if (status === 'unseen') {
        conditions.push(`c.admin_seen_at IS NULL`);
      }
    }

    // Sorting
    let orderClause = 'ORDER BY c.created_at DESC';
    if (sort === 'oldest') orderClause = 'ORDER BY c.created_at ASC';
    else if (sort === 'name') orderClause = 'ORDER BY c.name ASC';
    else if (sort === 'bookings') orderClause = 'ORDER BY total_bookings DESC, c.created_at DESC';

    // Total count
    const countRes = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM customers c
      WHERE ${conditions.join(' AND ')};
    `, values);

    const total = countRes.rows[0]?.total || 0;
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(5, parseInt(limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;

    values.push(safeLimit);
    const limitIdx = values.length;
    values.push(offset);
    const offsetIdx = values.length;

    const listRes = await pool.query(`
      SELECT 
        c.id, c.customer_code, c.name, c.email, c.phone, c.created_at, c.admin_seen_at,
        c.account_status, c.permanent_address,
        COALESCE(u.is_phone_verified, true) AS mobile_verified,
        COUNT(sr.id)::int AS total_bookings,
        COUNT(sr.id) FILTER (WHERE sr.status = 'completed')::int AS completed_bookings,
        MAX(sr.created_at) AS last_booking_at
      FROM customers c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN service_requests sr ON sr.customer_id = c.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY c.id, u.is_phone_verified
      ${orderClause}
      LIMIT $${limitIdx} OFFSET $${offsetIdx};
    `, values);

    // Dynamic distinct categories from service_requests
    const catRows = await pool.query(`
      SELECT DISTINCT COALESCE(NULLIF(TRIM(category), ''), 'General Maintenance') AS cat_name
      FROM service_requests
      ORDER BY cat_name ASC;
    `);
    const availableCategories = catRows.rows.map(r => r.cat_name);

    const customers = listRes.rows.map((row) => ({
      id: row.id,
      customerCode: row.customer_code || String(row.id),
      name: row.name || 'Anonymous Customer',
      email: row.email || '',
      phone: row.phone || '',
      maskedEmail: row.email || '',
      maskedPhone: row.phone || '',
      city: extractCityAndState(row.permanent_address).city !== 'Other' ? extractCityAndState(row.permanent_address).city : 'Tiruchirappalli',
      state: extractCityAndState(row.permanent_address).state !== 'Other' ? extractCityAndState(row.permanent_address).state : 'Tamil Nadu',
      location: extractCityAndState(row.permanent_address).location,
      fullAddress: row.permanent_address || 'Not provided',
      totalBookings: row.total_bookings,
      completedBookings: row.completed_bookings,
      lastActiveFormatted: row.last_booking_at ? formatToIST(row.last_booking_at) : formatToIST(row.created_at),
      accountStatus: row.account_status || 'active',
      status: row.account_status || 'active',
      isNew: row.admin_seen_at === null,
      joinedDateFormatted: formatToIST(row.created_at),
      registeredAtFormatted: formatToIST(row.created_at)
    }));

    return {
      customers,
      availableCategories,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1
      }
    };
  }
}

