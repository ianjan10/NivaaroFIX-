import puppeteer from 'puppeteer-core';
import path from 'node:path';
import assert from 'node:assert';
import fs from 'node:fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACTS_DIR = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\fe838a24-c2ad-4c4d-aaca-0c589ce4288f';

// Helper to click a button by text
async function clickButtonWithText(page, text) {
  const clicked = await page.evaluate((t) => {
    const btns = Array.from(document.querySelectorAll('button'));
    const target = btns.find(b => b.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if (target) {
      target.click();
      return true;
    }
    return false;
  }, text);
  return clicked;
}

async function runE2E() {
  console.log('=== STARTING LIVE CAMERA REDESIGN E2E TEST SUITE ===');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 950 });

    const testAgentSession = {
      id: 1,
      partnerId: '202600001',
      name: 'Rahul',
      email: 'kumar@gmail.com',
      phone: '+91 8796372897',
      trade: 'electrician',
      isLoggedIn: true,
      is_logged_in: true,
      kycStatus: 'needs_attention',
      kyc_status: 'needs_attention',
      avatarUrl: null,
      permanent_address: '13th Street, Bhel Nagar, Thuvakudi, 620015',
      isPhoneVerified: true
    };

    await page.evaluateOnNewDocument((session) => {
      localStorage.setItem('nivaaro-agent', JSON.stringify(session));
    }, testAgentSession);

    console.log('Step 1: Navigating to agent profile...');
    await page.goto('http://localhost:5500?portal=agent&action=profile', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));

    // 1. Open Live Camera Modal
    console.log('Step 2: Opening live camera modal...');
    const opened = await clickButtonWithText(page, 'Take photo') || await clickButtonWithText(page, 'Replace photo');
    assert(opened, 'Must find and click Take photo or Replace photo button');
    await new Promise(r => setTimeout(r, 500));

    // 2. Verify Pre-permission state
    console.log('Step 3: Verifying pre-permission state...');
    const dialog = await page.waitForSelector('[role="dialog"][aria-modal="true"]');
    assert(dialog, 'Modal must have role="dialog" and aria-modal="true"');

    const titleText = await page.$eval('h2[id]', el => el.textContent.trim());
    assert.strictEqual(titleText, 'Take your photo', 'Title must be "Take your photo" (no camera icon or "Live Camera Verification")');

    // Screenshot Pre-permission state
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, '45_camera_pre_permission_screen.png') });
    console.log('✓ Captured 45_camera_pre_permission_screen.png');

    // 3. Click "Allow camera" to start stream
    console.log('Step 4: Clicking "Allow camera" to start stream...');
    const allowClicked = await clickButtonWithText(page, 'Allow camera');
    assert(allowClicked, 'Must click "Allow camera"');
    await new Promise(r => setTimeout(r, 1500));

    // Verify removed elements are GONE
    const darkRect = await page.$('div[style*="background: #151c26"], div[style*="background:#151c26"]');
    assert(!darkRect, 'Old dark rectangle container must be completely removed');

    const amberRing = await page.$('[style*="#f59e0b"], [style*="#fbbf24"]');
    assert(!amberRing, 'Amber ring and amber text must be completely removed');

    const pills = await page.evaluate(() => {
      const texts = Array.from(document.querySelectorAll('span')).map(s => s.textContent.trim());
      return texts.some(t => t.includes('Align Face') || t.includes('Good Lighting') || t.includes('Hold Steady'));
    });
    assert(!pills, 'Three status pills (Align Face, Good Lighting, Hold Steady) must be completely removed');

    // Verify video preview is mirrored
    const videoTransform = await page.$eval('video', el => window.getComputedStyle(el).transform);
    console.log('Video transform in preview:', videoTransform);
    assert(videoTransform.includes('matrix(-1') || videoTransform.includes('-1, 0, 0, 1'), 'Video preview must be mirrored with scaleX(-1)');

    // Verify single guidance line
    const guidanceElem = await page.$('[aria-live="polite"]');
    assert(guidanceElem, 'Single guidance element must exist with aria-live="polite"');
    const guidanceText = await page.evaluate(el => el.textContent.trim(), guidanceElem);
    console.log('Live Guidance text:', guidanceText);
    assert(guidanceText.length > 0, 'Guidance message must be present');

    // Verify 48px brand-green Capture button
    const btnHeight = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cap = btns.find(b => b.textContent.trim() === 'Capture');
      return cap ? cap.offsetHeight : 0;
    });
    assert.strictEqual(btnHeight, 48, 'Capture button height must be 48px');

    // Capture screenshot of live capture viewfinder
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, '46_camera_live_capture_viewfinder.png') });
    console.log('✓ Captured 46_camera_live_capture_viewfinder.png');

    // 4. Trigger capture snapshot
    console.log('Step 5: Triggering photo capture...');
    await page.evaluate(() => {
      if (typeof window.__triggerLiveCapture === 'function') {
        window.__triggerLiveCapture({ exposure: 120, blurScore: 22, faceSize: 0.52, status: 'pass' });
      }
    });
    await new Promise(r => setTimeout(r, 600));

    // 5. Verify Review Stage
    console.log('Step 6: Verifying review stage...');
    const reviewGuidance = await page.$eval('[aria-live="polite"]', el => el.textContent.trim());
    console.log('Review guidance text:', reviewGuidance);
    assert(reviewGuidance === 'Looks good?' || reviewGuidance.includes('blurry'), 'Review guidance must be "Looks good?" or quality hint');

    // Verify captured photo is NOT mirrored
    const capturedImgTransform = await page.$eval('img[alt="Captured portrait"]', el => window.getComputedStyle(el).transform);
    console.log('Captured photo transform:', capturedImgTransform);
    assert(capturedImgTransform === 'none' || capturedImgTransform === 'matrix(1, 0, 0, 1, 0, 0)', 'Captured photo MUST NOT be mirrored');

    // Screenshot Review stage
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, '47_camera_review_stage.png') });
    console.log('✓ Captured 47_camera_review_stage.png');

    // 6. Confirm and Upload
    console.log('Step 7: Confirming photo upload ("Use photo")...');
    const confirmed = await clickButtonWithText(page, 'Use photo') || await clickButtonWithText(page, 'Use anyway');
    assert(confirmed, 'Must click Use photo or Use anyway');
    await new Promise(r => setTimeout(r, 1400));

    // Verify sheet closed
    const modalCheck = await page.$('[role="dialog"][aria-modal="true"]');
    assert(!modalCheck, 'Sheet must close after photo confirmation');

    // Verify photo was captured and profile is NOT prematurely locked into review
    const bodyText = await page.$eval('body', el => el.innerText);
    assert(!bodyText.includes('Photo locked during review'), 'Photo must NOT be locked into review before explicit submission');
    assert(bodyText.includes('Retake photo') || bodyText.includes('Replace photo'), 'Profile must offer Retake photo or Replace photo');

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, '48_profile_photo_captured_unlocked.png') });
    console.log('✓ Captured 48_profile_photo_captured_unlocked.png');

    // 7. Test Responsive Viewports (Mobile: 375px)
    console.log('Step 8: Testing mobile viewport (375px)...');
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 800));

    await clickButtonWithText(page, 'Take photo') || await clickButtonWithText(page, 'Replace photo') || await clickButtonWithText(page, 'Retake photo');
    await new Promise(r => setTimeout(r, 500));

    await clickButtonWithText(page, 'Allow camera');
    await new Promise(r => setTimeout(r, 800));

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, '49_camera_mobile_375px_fullscreen.png') });
    console.log('✓ Captured 49_camera_mobile_375px_fullscreen.png');

    // Close modal
    const closeBtn = await page.$('button[aria-label="Close photo capture"]');
    if (closeBtn) await closeBtn.click();
    await new Promise(r => setTimeout(r, 400));

    console.log('🎉 ALL END-TO-END LIVE CAMERA TESTS COMPLETED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

runE2E().catch(err => {
  console.error('E2E TEST FAILURE:', err);
  process.exit(1);
});
