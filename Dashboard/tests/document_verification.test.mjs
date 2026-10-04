/**
 * NivaaroFix Professional Profile Document Verification End-to-End Tests
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runDocVerificationTests() {
  console.log('📋 Running Professional Document Verification End-to-End Tests...\n');
  let passed = 0;
  let failed = 0;

  function report(name, condition, detail = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  const agentProfilePath = path.join(__dirname, '../../WebLogin/src/pages/AgentProfilePage.jsx');
  const cssPath = path.join(__dirname, '../../WebLogin/src/styles/designSystem.css');
  const agentRoutesPath = path.join(__dirname, '../../backend/src/routes/agentRoutes.js');
  const dbConfigPath = path.join(__dirname, '../../backend/src/config/db.js');

  const agentProfileCode = fs.readFileSync(agentProfilePath, 'utf8');
  const cssCode = fs.readFileSync(cssPath, 'utf8');
  const agentRoutesCode = fs.readFileSync(agentRoutesPath, 'utf8');
  const dbConfigCode = fs.readFileSync(dbConfigPath, 'utf8');

  // --- Suite 1: Layout & Component Placement ---
  report(
    'Layout: Document verification cards placed in sidebar beneath photo card',
    agentProfileCode.includes('pro-documents-container') &&
    agentProfileCode.indexOf('pro-documents-container') > agentProfileCode.indexOf('profile-avatar-card') &&
    agentProfileCode.indexOf('pro-documents-container') > agentProfileCode.indexOf('profile-sidebar-column')
  );

  report(
    'Layout: Uses pro-document-card class with matching card styles and tokens',
    cssCode.includes('.pro-document-card') &&
    cssCode.includes('border-radius: 16px') &&
    cssCode.includes('background: #faf8f4')
  );

  // --- Suite 2: Two Upload Slots (Aadhaar Card & Driving License) ---
  report(
    'Slot 1: Aadhaar Card labeled with muted (Required) marker',
    agentProfileCode.includes("renderDocumentCard('aadhaar', 'Aadhaar Card', true)") &&
    agentProfileCode.includes('(Required)')
  );

  report(
    'Slot 2: Driving License labeled with muted (Optional) marker',
    agentProfileCode.includes("renderDocumentCard('driving_license', 'Driving License', false)") &&
    agentProfileCode.includes('(Optional)')
  );

  // --- Suite 3: Empty State & Drop Zone ---
  report(
    'Empty State: Dashed-border drop zone with upload icon and accepted format text',
    agentProfileCode.includes('doc-dropzone') &&
    agentProfileCode.includes('Drag &amp; drop or click to upload') &&
    agentProfileCode.includes('JPG, PNG, PDF — max 5MB') &&
    cssCode.includes('.doc-dropzone:hover')
  );

  // --- Suite 4: Filled State & Actions ---
  report(
    'Filled State: Renders file thumbnail/icon, filename, timestamp, and Replace button',
    agentProfileCode.includes('btn-replace-doc') &&
    agentProfileCode.includes('Replace') &&
    agentProfileCode.includes('formatUploadTime') &&
    agentProfileCode.includes('formatFileSize')
  );

  // --- Suite 5: Status Indicators (Text + Icon, No Pill Badges) ---
  report(
    'Status Indicators: Not Uploaded, Under Review, Verified, and Rejected without filled pill badges',
    agentProfileCode.includes('renderDocStatus') &&
    agentProfileCode.includes('Not Uploaded') &&
    agentProfileCode.includes('Under Review') &&
    agentProfileCode.includes('Verified') &&
    agentProfileCode.includes('Rejected') &&
    !agentProfileCode.includes('doc-status-pill')
  );

  // --- Suite 6: Thin Progress Bar & Rejection Reason ---
  report(
    'Upload Progress: Inline thin progress bar with percentage, no spinner overlay',
    agentProfileCode.includes('uploadProgress[docKey]') &&
    agentProfileCode.includes('height: \'3px\'') &&
    agentProfileCode.includes('Uploading document...')
  );

  report(
    'Rejected State: Inline rejection reason with re-upload prompt',
    agentProfileCode.includes('Rejection reason:') &&
    agentProfileCode.includes('Re-upload document')
  );

  // --- Suite 7: Strict Zero Emoji Enforcement ---
  const emojiRegex = /(\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|[\u2600-\u27bf])/g;
  const emojisFound = agentProfileCode.match(emojiRegex) || [];
  report(
    'Design System: Zero emojis in AgentProfilePage code and templates',
    emojisFound.length === 0,
    `found: ${emojisFound.join(',')}`
  );

  // --- Suite 8: Backend Schema & Endpoints ---
  report(
    'Database: agent_documents table definition in PostgreSQL db.js',
    dbConfigCode.includes('CREATE TABLE IF NOT EXISTS agent_documents') &&
    dbConfigCode.includes('document_type') &&
    dbConfigCode.includes('rejection_reason')
  );

  report(
    'Backend API: GET /documents/:identifier endpoint exists in agentRoutes.js',
    agentRoutesCode.includes("router.get('/documents/:identifier'")
  );

  report(
    'Backend API: POST /upload-document endpoint exists in agentRoutes.js',
    agentRoutesCode.includes("router.post('/upload-document'")
  );

  report(
    'Backend API: PATCH /document-status endpoint exists in agentRoutes.js',
    agentRoutesCode.includes("router.patch('/document-status'")
  );

  // --- Suite 9: Live Backend REST API Test ---
  try {
    const testEmail = 'e2e.doc.test.partner@nivaarofix.in';
    const testPartnerId = '202699999';

    // 0. Clean any prior test rows
    const { pool } = await import('../../backend/src/config/db.js');
    await pool.query('DELETE FROM agent_documents WHERE agent_email = $1 OR partner_id = $2;', [testEmail, testPartnerId]);

    // 1. Fetch initial documents
    const getRes = await fetch(`http://localhost:5000/api/agents/documents/${encodeURIComponent(testEmail)}`);
    const getData = await getRes.json();
    report(
      'Live Backend: GET /api/agents/documents returns initial Not Uploaded status',
      getRes.status === 200 &&
      getData.success === true &&
      getData.documents?.aadhaar?.status === 'Not Uploaded' &&
      getData.documents?.driving_license?.status === 'Not Uploaded'
    );

    // 2. Upload Aadhaar Card
    const uploadAadhaarRes = await fetch('http://localhost:5000/api/agents/upload-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        partnerId: testPartnerId,
        documentType: 'aadhaar',
        fileName: 'aadhaar_card_front.pdf',
        fileType: 'application/pdf',
        fileSize: 1048576,
        fileData: 'data:application/pdf;base64,JVBERi0xLjQK...',
        status: 'Under Review'
      })
    });
    const uploadAadhaarData = await uploadAadhaarRes.json();
    report(
      'Live Backend: POST /api/agents/upload-document uploads Aadhaar Card under review',
      uploadAadhaarRes.status === 200 &&
      uploadAadhaarData.success === true &&
      uploadAadhaarData.document?.status === 'Under Review' &&
      uploadAadhaarData.document?.fileName === 'aadhaar_card_front.pdf'
    );

    // 3. Update status to Rejected with reason
    const rejectRes = await fetch('http://localhost:5000/api/agents/document-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        partnerId: testPartnerId,
        documentType: 'aadhaar',
        status: 'Rejected',
        rejectionReason: 'Image unclear — please re-upload'
      })
    });
    const rejectData = await rejectRes.json();
    report(
      'Live Backend: PATCH /api/agents/document-status rejects document with inline reason',
      rejectRes.status === 200 &&
      rejectData.success === true &&
      rejectData.document?.status === 'Rejected' &&
      rejectData.document?.rejectionReason === 'Image unclear — please re-upload'
    );

    // 4. Upload Driving License (Optional)
    const uploadDlRes = await fetch('http://localhost:5000/api/agents/upload-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        partnerId: testPartnerId,
        documentType: 'driving_license',
        fileName: 'driving_license.jpg',
        fileType: 'image/jpeg',
        fileSize: 524288,
        fileData: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        status: 'Under Review'
      })
    });
    const uploadDlData = await uploadDlRes.json();
    report(
      'Live Backend: POST /api/agents/upload-document uploads Driving License',
      uploadDlRes.status === 200 &&
      uploadDlData.success === true &&
      uploadDlData.document?.documentType === 'driving_license'
    );

    // 5. Update Driving License to Verified
    const verifyRes = await fetch('http://localhost:5000/api/agents/document-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        partnerId: testPartnerId,
        documentType: 'driving_license',
        status: 'Verified'
      })
    });
    const verifyData = await verifyRes.json();
    report(
      'Live Backend: PATCH /api/agents/document-status verifies document successfully',
      verifyRes.status === 200 &&
      verifyData.success === true &&
      verifyData.document?.status === 'Verified'
    );

    // Clean up test records
    await pool.query('DELETE FROM agent_documents WHERE agent_email = $1 OR partner_id = $2;', [testEmail, testPartnerId]);
    await pool.end();
  } catch (apiErr) {
    report('Live Backend API Connection', false, apiErr.message);
  }

  console.log(`\n========================================`);
  console.log(`Document Verification Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runDocVerificationTests();
