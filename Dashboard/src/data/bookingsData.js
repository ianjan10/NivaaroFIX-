/**
 * NivaaroFix Canonical Bookings Dataset
 * Persistent, consistent data source shared across the entire application.
 * All views (My Bookings page, modals, invoices, notifications, toasts)
 * reference this canonical dataset to ensure 100% data integrity.
 */

export const CANONICAL_BOOKINGS = [
  {
    id: 'b-1',
    bookingId: 'NVF-24091847',
    bookingRef: 'NVF-24091847',
    serviceTitle: 'Switchboard repair & MCB check',
    category: 'electrician',
    issueType: 'Sparks from main switchboard & intermittent tripping',
    locality: 'Anna Nagar, Chennai',
    address: 'Plot 142, 2nd Avenue, Anna Nagar East, Chennai - 600040',
    scheduledTime: 'Today, 2:30 PM',
    status: 'En route',
    stageIndex: 2,
    etaMinutes: 18,
    totalAmount: 450,
    isEstimate: true,
    otpCode: '8492',
    technicianName: 'Rajesh Kumar',
    technicianRole: 'Master Electrician',
    technicianRating: '4.9',
    technicianJobs: 312,
    technicianPhone: '+91 98401 23456',
    paymentMethod: 'UPI / Cash on completion',
    ratingGiven: null,
    breakdown: {
      inspectionFee: 299,
      laborFee: 299,
      partsEstimate: 100,
      parts: 100,
      gst: 51,
      total: 450
    },
    createdAt: new Date().toISOString()
  },
  {
    id: 'b-2',
    bookingId: 'NVF-24081203',
    bookingRef: 'NVF-24081203',
    serviceTitle: 'Tap leak fix & cartridge replacement',
    category: 'plumber',
    issueType: 'Continuous dripping faucet & high pressure valve replacement',
    locality: 'T. Nagar, Chennai',
    address: 'Flat 4B, Harmony Towers, T. Nagar, Chennai - 600017',
    scheduledTime: '14 Aug 2026, 11:00 AM',
    date: '14 Aug 2026, 11:00 AM',
    completedAt: '2026-08-14T11:45:00.000Z',
    status: 'Completed',
    stageIndex: 3,
    etaMinutes: 0,
    totalAmount: 280,
    isEstimate: false,
    partsAmount: 80,
    otpCode: '5921',
    technicianName: 'Suresh Babu',
    technicianRole: 'Certified Master Plumber',
    technicianRating: '4.8',
    technicianJobs: 198,
    technicianPhone: '+91 94440 76543',
    paymentMethod: 'UPI (PhonePe Verified)',
    ratingGiven: null,
    breakdown: {
      inspectionFee: 169,
      laborFee: 169,
      partsEstimate: 80,
      parts: 80,
      gst: 31,
      total: 280
    },
    createdAt: '2026-08-14T10:15:00.000Z'
  },
  {
    id: 'b-3',
    bookingId: 'NVF-24070556',
    bookingRef: 'NVF-24070556',
    serviceTitle: 'MCB replacement & distribution box overhaul',
    category: 'electrician',
    issueType: 'Heavy 32A isolator burn & wire lug renewal',
    locality: 'Velachery, Chennai',
    address: 'No. 28, Bypass Road, Velachery, Chennai - 600042',
    scheduledTime: '22 Jul 2026, 4:15 PM',
    date: '22 Jul 2026, 4:15 PM',
    completedAt: '2026-07-22T17:00:00.000Z',
    status: 'Completed',
    stageIndex: 3,
    etaMinutes: 0,
    totalAmount: 620,
    isEstimate: false,
    partsAmount: 320,
    otpCode: '7104',
    technicianName: 'Karthik Raman',
    technicianRole: 'Senior Electrical Contractor',
    technicianRating: '4.9',
    technicianJobs: 440,
    technicianPhone: '+91 98840 11223',
    paymentMethod: 'Credit Card (Visa •••• 4242)',
    ratingGiven: 5,
    breakdown: {
      inspectionFee: 254,
      laborFee: 254,
      partsEstimate: 320,
      parts: 320,
      gst: 46,
      total: 620
    },
    createdAt: '2026-07-22T15:30:00.000Z'
  }
];
