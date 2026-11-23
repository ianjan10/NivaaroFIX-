import assert from 'node:assert';
import {
  ANALYSIS_CONFIG,
  GUIDANCE_MESSAGES,
  computeLaplacianVariance,
  analyzeFrameQuality,
  GuidanceHysteresis,
  analyzeStillQuality
} from '../apps/auth/src/utils/faceAnalysis.js';

console.log('--- Running Face Analysis & Quality Engine Tests ---');

// Helper to create synthetic RGBA pixel buffers
function createSyntheticFrame(width = 320, height = 320, generator) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const { r, g, b } = generator(x, y, width, height);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

// 1. Sharp, well-lit, centered face
{
  console.log('Test 1: Sharp, well-lit, centered face');
  const frame = createSyntheticFrame(320, 320, (x, y) => {
    // Face centered at (160, 160), size 160x160 (50% diameter)
    const isFace = x >= 80 && x < 240 && y >= 80 && y < 240;
    if (isFace) {
      // High frequency checkerboard pattern for sharpness
      const checker = ((x ^ y) & 4) ? 160 : 100;
      return { r: checker, g: checker, b: checker };
    }
    return { r: 120, g: 120, b: 120 };
  });

  const faceBox = [{ x: 80, y: 80, width: 160, height: 160 }];
  const history = { laplacianBuffer: [], consecutiveBlurCount: 0 };
  const result = analyzeFrameQuality(frame, faceBox, history);

  assert.strictEqual(result.state, 'ready', 'Expected state to be ready');
  assert.strictEqual(result.message, GUIDANCE_MESSAGES.ready);
  assert.strictEqual(result.isReady, true);
  console.log('✓ Test 1 passed: State is ready ("Perfect. Hold still")');
}

// 2. Overexposed / Clipped Frame (THE CRITICAL BUG REPRODUCTION)
{
  console.log('Test 2: Overexposed / clipped frame (Bug reproduction check)');
  // A frame where the face / lighting is heavily blown out (> 240 or mean > 200)
  const overexposedFrame = createSyntheticFrame(320, 320, (x, y) => {
    const isFace = x >= 80 && x < 240 && y >= 80 && y < 240;
    if (isFace) {
      // Blown out whites, gradient near 0
      return { r: 248, g: 250, b: 252 };
    }
    return { r: 220, g: 220, b: 220 };
  });

  const faceBox = [{ x: 80, y: 80, width: 160, height: 160 }];
  const history = { laplacianBuffer: [], consecutiveBlurCount: 0 };
  const result = analyzeFrameQuality(overexposedFrame, faceBox, history);

  // Must report 'too_bright' and NEVER blur or 'Good lighting'
  assert.strictEqual(result.state, 'too_bright', 'Overexposed frame must trigger too_bright');
  assert.strictEqual(result.message, 'Too bright. Face a softer light');
  assert.strictEqual(result.isReady, false);
  assert.notStrictEqual(result.state, 'motion_blur', 'Overexposed frame must NEVER report blur');
  assert.notStrictEqual(result.state, 'ready', 'Overexposed frame must NEVER report ready');
  console.log('✓ Test 2 passed: Overexposed frame correctly reports "Too bright. Face a softer light", NOT blur');
}

// 3. Dark Frame
{
  console.log('Test 3: Dark frame (low luminance)');
  const darkFrame = createSyntheticFrame(320, 320, (x, y) => {
    return { r: 30, g: 30, b: 30 };
  });

  const faceBox = [{ x: 80, y: 80, width: 160, height: 160 }];
  const history = { laplacianBuffer: [], consecutiveBlurCount: 0 };
  const result = analyzeFrameQuality(darkFrame, faceBox, history);

  assert.strictEqual(result.state, 'too_dark');
  assert.strictEqual(result.message, 'Find more light');
  assert.strictEqual(result.isReady, false);
  console.log('✓ Test 3 passed: Dark frame correctly reports "Find more light"');
}

// 4. Backlit Frame (Background much brighter than face)
{
  console.log('Test 4: Backlit frame');
  const backlitFrame = createSyntheticFrame(320, 320, (x, y) => {
    const isFace = x >= 80 && x < 240 && y >= 80 && y < 240;
    if (isFace) {
      return { r: 75, g: 75, b: 75 }; // Face luma = 75
    }
    return { r: 210, g: 210, b: 210 }; // Background luma = 210 (diff = 135 > 65)
  });

  const faceBox = [{ x: 80, y: 80, width: 160, height: 160 }];
  const history = { laplacianBuffer: [], consecutiveBlurCount: 0 };
  const result = analyzeFrameQuality(backlitFrame, faceBox, history);

  assert.strictEqual(result.state, 'backlight');
  assert.strictEqual(result.message, 'Light is behind you. Face the light');
  console.log('✓ Test 4 passed: Backlit frame correctly reports "Light is behind you. Face the light"');
}

// 5. Blurry face under normal exposure
{
  console.log('Test 5: Blurry face under normal exposure (Laplacian variance)');
  // A smooth/flat face with no edge gradients
  const blurryFrame = createSyntheticFrame(320, 320, (x, y) => {
    const isFace = x >= 80 && x < 240 && y >= 80 && y < 240;
    if (isFace) {
      // Extremely smooth gradient (variance near 0)
      return { r: 130 + Math.floor(x * 0.02), g: 130, b: 130 };
    }
    return { r: 120, g: 120, b: 120 };
  });

  const faceBox = [{ x: 80, y: 80, width: 160, height: 160 }];
  const history = { laplacianBuffer: [], consecutiveBlurCount: 0 };

  // Frame 1
  let res = analyzeFrameQuality(blurryFrame, faceBox, history);
  // On frame 1, consecutive fails is 1 (< 3 required), so it doesn't immediately fail
  assert.strictEqual(history.consecutiveBlurCount, 1);

  // Frame 2
  res = analyzeFrameQuality(blurryFrame, faceBox, history);
  assert.strictEqual(history.consecutiveBlurCount, 2);

  // Frame 3 (consecutive fails reaches 3)
  res = analyzeFrameQuality(blurryFrame, faceBox, history);
  assert.strictEqual(history.consecutiveBlurCount, 3);
  assert.strictEqual(res.state, 'motion_blur');
  assert.strictEqual(res.message, 'Hold still');
  console.log('✓ Test 5 passed: Blurry face reports "Hold still" after consecutive failures');
}

// 6. Off-Center Face
{
  console.log('Test 6: Off-center face');
  const frame = createSyntheticFrame(320, 320, () => ({ r: 130, g: 130, b: 130 }));
  // Face placed way at top-left
  const faceBox = [{ x: 10, y: 10, width: 140, height: 140 }];
  const history = { laplacianBuffer: [], consecutiveBlurCount: 0 };
  const res = analyzeFrameQuality(frame, faceBox, history);

  assert.strictEqual(res.state, 'off_center');
  assert.strictEqual(res.message, 'Center your face');
  console.log('✓ Test 6 passed: Off-center face reports "Center your face"');
}

// 7. Too far (face size < 35% of circle diameter)
{
  console.log('Test 7: Too far');
  const frame = createSyntheticFrame(320, 320, () => ({ r: 130, g: 130, b: 130 }));
  // Size 80px / 320px = 25% (< 35%)
  const faceBox = [{ x: 120, y: 120, width: 80, height: 80 }];
  const res = analyzeFrameQuality(frame, faceBox, {});

  assert.strictEqual(res.state, 'too_far');
  assert.strictEqual(res.message, 'Move a little closer');
  console.log('✓ Test 7 passed: Small face reports "Move a little closer"');
}

// 8. Too close (face size > 65% of circle diameter)
{
  console.log('Test 8: Too close');
  const frame = createSyntheticFrame(320, 320, () => ({ r: 130, g: 130, b: 130 }));
  // Size 240px / 320px = 75% (> 65%)
  const faceBox = [{ x: 40, y: 40, width: 240, height: 240 }];
  const res = analyzeFrameQuality(frame, faceBox, {});

  assert.strictEqual(res.state, 'too_close');
  assert.strictEqual(res.message, 'Move back a little');
  console.log('✓ Test 8 passed: Large face reports "Move back a little"');
}

// 9. Multiple faces
{
  console.log('Test 9: Multiple faces');
  const frame = createSyntheticFrame(320, 320, () => ({ r: 130, g: 130, b: 130 }));
  const faces = [
    { x: 50, y: 80, width: 100, height: 100 },
    { x: 170, y: 80, width: 100, height: 100 }
  ];
  const res = analyzeFrameQuality(frame, faces, {});

  assert.strictEqual(res.state, 'several_faces');
  assert.strictEqual(res.message, 'Only one person in the frame');
  console.log('✓ Test 9 passed: Multiple faces reports "Only one person in the frame"');
}

// 10. No face
{
  console.log('Test 10: No face');
  const frame = createSyntheticFrame(320, 320, () => ({ r: 130, g: 130, b: 130 }));
  const res = analyzeFrameQuality(frame, [], {});

  assert.strictEqual(res.state, 'no_face');
  assert.strictEqual(res.message, 'Center your face in the circle');
  console.log('✓ Test 10 passed: No face reports "Center your face in the circle"');
}

// 11. Hysteresis Test (600ms hold time required to change message)
{
  console.log('Test 11: Hysteresis stability');
  const h = new GuidanceHysteresis(600);
  assert.strictEqual(h.currentOutputState, 'no_face');

  let t = 1000;
  // Frame arrives with 'too_dark'
  let out = h.update('too_dark', t);
  assert.strictEqual(out, 'no_face', 'Should remain no_face initially');

  // After 300ms of 'too_dark' (not yet 600ms)
  t += 300;
  out = h.update('too_dark', t);
  assert.strictEqual(out, 'no_face', 'Should still be no_face after 300ms');

  // Glitch frame with 'motion_blur' resets pending
  t += 50;
  out = h.update('motion_blur', t);
  assert.strictEqual(out, 'no_face', 'Glitch frame does not switch output');

  // Back to 'too_dark'
  t += 50;
  out = h.update('too_dark', t);
  assert.strictEqual(out, 'no_face');

  // Now held steady for 600ms
  t += 600;
  out = h.update('too_dark', t);
  assert.strictEqual(out, 'too_dark', 'After 600ms steady hold, state transitions to too_dark');
  console.log('✓ Test 11 passed: Hysteresis correctly prevents flicker');
}

// 12. Review Stage Still Quality Test
{
  console.log('Test 12: Review stage still photo quality test');
  const blurryFrame = createSyntheticFrame(320, 320, (x, y) => {
    return { r: 128, g: 128, b: 128 };
  });
  const faceBox = [{ x: 80, y: 80, width: 160, height: 160 }];
  const stillRes = analyzeStillQuality(blurryFrame, faceBox);
  assert.strictEqual(stillRes.isBlurry, true);
  assert.strictEqual(stillRes.guidanceText, 'That one is a bit blurry. Retake?');
  console.log('✓ Test 12 passed: Blurry still photo suggests retake');
}

console.log('🎉 ALL 12 FACE ANALYSIS UNIT TESTS PASSED SUCCESSFULLY!');
