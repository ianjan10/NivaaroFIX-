import assert from 'node:assert';
import { test, describe, before, after } from 'node:test';

const BACKEND_URL = 'http://localhost:5000';

describe('Real User Booking Flow & Photo Capture Tests (Production-Ready)', () => {
  let testCustomerEmail = `real_user_${Date.now()}@example.com`;
  let testCustomerName = 'Aarav Sharma';
  let createdBookingRef = null;
  let uploadedPhotoMeta = null;

  before(async () => {
    // Wait for backend to be online
    let retries = 5;
    while (retries > 0) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/health`);
        if (res.ok) break;
      } catch (e) {
        await new Promise((r) => setTimeout(r, 800));
      }
      retries--;
    }
  });

  test('1. Security: Agent role cannot create customer bookings (403 AGENT_CANNOT_BOOK)', async () => {
    const res = await fetch(`${BACKEND_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'agent',
        userName: 'Rajesh Partner',
        problemDescription: 'Fan fixing',
        address: '123 Partner Lane'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 403, 'Should return 403 Forbidden for agent role');
    assert.strictEqual(data.code, 'AGENT_CANNOT_BOOK');
  });

  test('2. Validation: Problem description is required (400 DESCRIPTION_REQUIRED)', async () => {
    const res = await fetch(`${BACKEND_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: testCustomerName,
        userEmail: testCustomerEmail,
        problemDescription: '', // Empty description
        address: 'Flat 402, Indiranagar, Bengaluru'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 400, 'Should return 400 Bad Request when problem description is empty');
    assert.strictEqual(data.code, 'DESCRIPTION_REQUIRED');
  });

  test('3. Validation: Service address is required (400 ADDRESS_REQUIRED)', async () => {
    const res = await fetch(`${BACKEND_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: testCustomerName,
        userEmail: testCustomerEmail,
        problemDescription: 'The MCB trips whenever I switch on the kitchen appliances.',
        address: '' // Empty address
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 400, 'Should return 400 Bad Request when address is empty');
    assert.strictEqual(data.code, 'ADDRESS_REQUIRED');
  });

  test('4. Photo Upload: Valid base64 JPEG image uploads and persists securely', async () => {
    // 1x1 transparent JPEG pixel in base64
    const validBase64Jpg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    const res = await fetch(`${BACKEND_URL}/api/bookings/upload-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: validBase64Jpg,
        filename: 'mcb_tripping_panel.jpg',
        mimeType: 'image/jpeg'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 201, 'Should return 201 Created');
    assert.strictEqual(data.success, true);
    assert.ok(data.photo.url, 'Should return secure photo url');
    assert.ok(data.photo.filename.startsWith('photo-'), 'Filename should be sanitized & unique');
    assert.strictEqual(data.photo.mimeType, 'image/jpeg');

    uploadedPhotoMeta = data.photo;
  });

  test('5. Photo Retrieval: Uploaded photo is retrievable via secure GET endpoint', async () => {
    assert.ok(uploadedPhotoMeta, 'Previous test must have uploaded a photo');

    const res = await fetch(`${BACKEND_URL}${uploadedPhotoMeta.url}`);
    assert.strictEqual(res.status, 200, 'Should serve uploaded photo');
    assert.strictEqual(res.headers.get('content-type'), 'image/jpeg');
  });

  test('6. Photo Validation: Unsupported file formats are rejected', async () => {
    const invalidBase64 = 'data:application/pdf;base64,JVBERi0xLjUK';

    const res = await fetch(`${BACKEND_URL}/api/bookings/upload-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: invalidBase64,
        filename: 'document.pdf',
        mimeType: 'application/pdf'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 400, 'Should reject non-image file formats');
    assert.strictEqual(data.success, false);
  });

  test('7. Real Booking Creation: Genuine customer creates booking in PostgreSQL with problem & photo', async () => {
    const res = await fetch(`${BACKEND_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: testCustomerName,
        userEmail: testCustomerEmail,
        userPhone: '+91 98765 43210',
        address: 'Flat 402, Green Valley Apartments, Indiranagar, Bengaluru',
        serviceId: 'mcb-fuse-short-circuit',
        serviceTitle: 'Book an Electrician',
        category: 'electrician',
        issueType: 'MCB & Fuse Diagnostics',
        problemDescription: 'The MCB trips whenever I switch on the kitchen appliances.',
        problemTiming: 'Today',
        problemFrequency: 'Constant',
        photos: uploadedPhotoMeta ? [uploadedPhotoMeta] : []
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 201, 'Should return 201 Created');
    assert.strictEqual(data.success, true);
    assert.ok(data.booking.bookingId.startsWith('NV-'), 'Real booking ref should start with NV-');
    assert.strictEqual(data.booking.status, 'Request Received', 'Status should be Request Received (no fake assignment)');
    assert.strictEqual(data.booking.technicianName, null, 'Technician name must be strictly null (zero fake tech)');
    assert.strictEqual(data.booking.technicianPhone, null, 'Technician phone must be strictly null');
    assert.strictEqual(data.booking.etaMinutes, null, 'ETA must be strictly null');
    assert.strictEqual(data.booking.problemDescription, 'The MCB trips whenever I switch on the kitchen appliances.');
    assert.strictEqual(data.booking.userName, testCustomerName);
    assert.strictEqual(data.booking.userEmail, testCustomerEmail);

    createdBookingRef = data.booking.bookingId;
  });

  test('8. Real Customer History: Authenticated user sees their own real booking', async () => {
    const res = await fetch(`${BACKEND_URL}/api/bookings/my-bookings?email=${encodeURIComponent(testCustomerEmail)}`);
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.bookings));
    assert.strictEqual(data.bookings.length, 1);
    assert.strictEqual(data.bookings[0].bookingId, createdBookingRef);
    assert.strictEqual(data.bookings[0].status, 'Request Received');
    assert.strictEqual(data.bookings[0].technicianName, null);
  });

  test('9. Empty State: Brand new user with no bookings sees empty list (zero seeded/fake bookings)', async () => {
    const brandNewEmail = `brand_new_customer_${Date.now()}@example.com`;
    const res = await fetch(`${BACKEND_URL}/api/bookings/my-bookings?email=${encodeURIComponent(brandNewEmail)}`);
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.deepStrictEqual(data.bookings, [], 'New genuine user must see an empty list, zero fake data');
  });

  test('10. Single Booking Lookup: Retrieve booking details by reference', async () => {
    assert.ok(createdBookingRef);
    const res = await fetch(`${BACKEND_URL}/api/bookings/${createdBookingRef}`);
    const data = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.booking.bookingId, createdBookingRef);
    assert.strictEqual(data.booking.userEmail, testCustomerEmail);
    assert.strictEqual(data.booking.status, 'Request Received');
  });
});
