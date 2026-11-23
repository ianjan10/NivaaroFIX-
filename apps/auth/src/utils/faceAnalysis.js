/**
 * NivaaroFix In-Browser Face & Image Quality Analysis Engine
 *
 * Implements calibrated face detection, localized face exposure/lighting checks,
 * clipping-aware sharpness/blur analysis using normalized Laplacian variance,
 * position & sizing metrics, and state hysteresis to prevent UI flicker.
 */

export const ANALYSIS_CONFIG = {
  // Target analysis dimensions
  downscaleWidth: 320,
  downscaleHeight: 320,

  // Sizing & Positioning relative to circular viewfinder (diameter = downscaleWidth)
  faceMinSizeRatio: 0.25,      // 25% of circle diameter
  faceMaxSizeRatio: 0.85,      // 85% of circle diameter
  centerToleranceRatio: 0.35,  // offset <= 35% of circle radius
  headPoseTolerance: 0.45,     // bounding box asymmetry/skew threshold

  // Exposure & Lighting (measured strictly on the face region)
  minFaceLuminance: 55,        // Below this -> too_dark ("Find more light")
  maxFaceLuminance: 195,       // Above this -> too_bright ("Too bright. Face a softer light")
  maxClippedLowRatio: 0.35,    // >35% near black pixels (luma < 25) -> too_dark
  maxClippedHighRatio: 0.15,   // >15% near white pixels (luma > 240) -> too_bright
  backlightLuminanceDiff: 65,  // backgroundLuma - faceLuma > 65 -> backlight ("Light is behind you. Face the light")

  // Sharpness & Blur (Laplacian variance on face region, normalized for luminance)
  laplacianMinVariance: 12.0,  // Below this -> blur
  consecutiveBlurFailsRequired: 3, // consecutive failing frames before reporting "Hold still"
  blurSmoothingWindow: 5,      // rolling average of Laplacian variance over 5 frames

  // Auto-capture & Hysteresis timing
  stateHysteresisMs: 600,      // state must hold for 600ms before guidance message changes
  autoCaptureHoldMs: 1500,     // all checks must pass for 1.5s to trigger auto-capture
  crossfadeDurationMs: 150     // message crossfade transition duration
};

export const GUIDANCE_MESSAGES = {
  camera_starting: 'Starting camera',
  no_face: 'Center your face in the circle',
  several_faces: 'Only one person in the frame',
  too_far: 'Move a little closer',
  too_close: 'Move back a little',
  off_center: 'Center your face',
  turned_away: 'Look straight at the camera',
  too_dark: 'Find more light',
  too_bright: 'Too bright. Face a softer light',
  backlight: 'Light is behind you. Face the light',
  motion_blur: 'Hold still',
  ready: 'Perfect. Hold still'
};

/**
 * Computes 3x3 Laplacian variance on a grayscale pixel buffer.
 */
export function computeLaplacianVariance(grayPixels, width, height) {
  if (!grayPixels || width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const prevRowOffset = (y - 1) * width;
    const nextRowOffset = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const lap =
        grayPixels[prevRowOffset + x] +
        grayPixels[nextRowOffset + x] +
        grayPixels[rowOffset + x - 1] +
        grayPixels[rowOffset + x + 1] -
        4 * grayPixels[rowOffset + x];

      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return Math.max(0, variance);
}

/**
 * Fast skin-color and facial feature detector for browsers lacking native FaceDetector
 * or for server-side/test environments.
 */
export function detectFacesHeuristic(imageData, width, height) {
  const data = imageData.data;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let skinPixelCount = 0;

  // Search skin-color locus in YCbCr color space
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const yVal = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
      const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;

      if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && yVal > 40) {
        skinPixelCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const minFacePixels = (width * height) * 0.015; // At least 1.5% skin pixels
  if (skinPixelCount < minFacePixels || minX >= maxX || minY >= maxY) {
    return [];
  }

  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const aspect = boxH / Math.max(1, boxW);

  // Reasonable face aspect ratio (height is between 0.8x and 2.2x width)
  if (aspect < 0.7 || aspect > 2.4) {
    return [];
  }

  return [
    {
      x: minX,
      y: minY,
      width: boxW,
      height: boxH
    }
  ];
}

/**
 * Initializes face detector: prefers native browser FaceDetector if available,
 * falling back to heuristic skin/feature contour locator.
 */
export function createFaceDetector() {
  if (typeof window !== 'undefined' && 'FaceDetector' in window) {
    try {
      const nativeDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
      return {
        type: 'native',
        detect: async (canvasOrImage) => {
          try {
            const results = await nativeDetector.detect(canvasOrImage);
            return results.map(f => ({
              x: f.boundingBox.x,
              y: f.boundingBox.y,
              width: f.boundingBox.width,
              height: f.boundingBox.height,
              landmarks: f.landmarks || []
            }));
          } catch (err) {
            return [];
          }
        }
      };
    } catch (e) {
      // Fall through to fallback
    }
  }

  return {
    type: 'heuristic',
    detect: async (canvasOrImage, ctx, width, height) => {
      let imgData;
      if (canvasOrImage.data) {
        imgData = canvasOrImage;
      } else if (ctx) {
        imgData = ctx.getImageData(0, 0, width, height);
      } else {
        return [];
      }
      return detectFacesHeuristic(imgData, width, height);
    }
  };
}

/**
 * Analyzes a video or image frame and evaluates quality according to strict priority order.
 *
 * @param {ImageData} imageData - Frame image data (recommended 320x320)
 * @param {Array} detectedFaces - Array of bounding boxes [{ x, y, width, height }]
 * @param {Object} history - Tracking history: { laplacianBuffer: [], consecutiveBlurCount: 0 }
 * @param {Object} options - Custom overrides for thresholds
 * @returns {Object} Quality analysis result
 */
export function analyzeFrameQuality(imageData, detectedFaces, history = {}, options = {}) {
  const config = { ...ANALYSIS_CONFIG, ...options };
  const { width, height, data } = imageData;
  const circleRadius = width / 2;
  const frameCenterX = width / 2;
  const frameCenterY = height / 2;

  // PRIORITY 1: Camera starting / No frame data
  if (!data || data.length === 0) {
    return {
      state: 'camera_starting',
      message: GUIDANCE_MESSAGES.camera_starting,
      scores: null,
      isReady: false
    };
  }

  const faces = detectedFaces || [];

  // PRIORITY 2: No face detected
  if (faces.length === 0) {
    return {
      state: 'no_face',
      message: GUIDANCE_MESSAGES.no_face,
      scores: { faceCount: 0 },
      isReady: false
    };
  }

  // PRIORITY 3: Several faces detected
  if (faces.length > 1) {
    return {
      state: 'several_faces',
      message: GUIDANCE_MESSAGES.several_faces,
      scores: { faceCount: faces.length },
      isReady: false
    };
  }

  const face = faces[0];
  const faceCenterX = face.x + face.width / 2;
  const faceCenterY = face.y + face.height / 2;
  const faceDiameter = Math.max(face.width, face.height);
  const circleDiameter = width; // circle fills the analysis frame
  const faceSizeRatio = faceDiameter / circleDiameter;

  // PRIORITY 4: Too far (face size < 35% of circle diameter)
  if (faceSizeRatio < config.faceMinSizeRatio) {
    return {
      state: 'too_far',
      message: GUIDANCE_MESSAGES.too_far,
      scores: { faceSizeRatio },
      isReady: false
    };
  }

  // PRIORITY 5: Too close (face size > 65% of circle diameter)
  if (faceSizeRatio > config.faceMaxSizeRatio) {
    return {
      state: 'too_close',
      message: GUIDANCE_MESSAGES.too_close,
      scores: { faceSizeRatio },
      isReady: false
    };
  }

  // PRIORITY 6: Off-center (distance from circle center > tolerance)
  const distFromCenter = Math.hypot(faceCenterX - frameCenterX, faceCenterY - frameCenterY);
  const maxCenterDist = circleRadius * config.centerToleranceRatio;
  if (distFromCenter > maxCenterDist) {
    return {
      state: 'off_center',
      message: GUIDANCE_MESSAGES.off_center,
      scores: { distFromCenter, maxCenterDist },
      isReady: false
    };
  }

  // PRIORITY 7: Face turned away or closed (head pose check)
  const faceAspect = face.height / Math.max(1, face.width);
  if (faceAspect < (1 - config.headPoseTolerance) || faceAspect > (1 + config.headPoseTolerance + 0.35)) {
    return {
      state: 'turned_away',
      message: GUIDANCE_MESSAGES.turned_away,
      scores: { faceAspect },
      isReady: false
    };
  }

  // -------------------------------------------------------------
  // LIGHTING & EXPOSURE (measured strictly on the face region!)
  // -------------------------------------------------------------
  const startX = Math.max(0, Math.floor(face.x));
  const endX = Math.min(width, Math.ceil(face.x + face.width));
  const startY = Math.max(0, Math.floor(face.y));
  const endY = Math.min(height, Math.ceil(face.y + face.height));

  let faceLumaSum = 0;
  let facePixelCount = 0;
  let clippedLowCount = 0;
  let clippedHighCount = 0;

  // We also extract grayscale pixels of face crop for Laplacian blur check
  const cropW = endX - startX;
  const cropH = endY - startY;
  const grayCrop = new Uint8Array(cropW * cropH);
  let cropIdx = 0;

  for (let y = startY; y < endY; y++) {
    const rowOffset = y * width;
    for (let x = startX; x < endX; x++) {
      const idx = (rowOffset + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;

      faceLumaSum += luma;
      facePixelCount++;

      if (luma < 25) clippedLowCount++;
      if (luma > 240) clippedHighCount++;

      grayCrop[cropIdx++] = Math.round(luma);
    }
  }

  const faceMeanLuma = facePixelCount > 0 ? (faceLumaSum / facePixelCount) : 0;
  const clippedLowRatio = facePixelCount > 0 ? (clippedLowCount / facePixelCount) : 0;
  const clippedHighRatio = facePixelCount > 0 ? (clippedHighCount / facePixelCount) : 0;

  // Background luminance sampling (pixels outside face box)
  let bgLumaSum = 0;
  let bgPixelCount = 0;
  for (let y = 0; y < height; y += 4) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 4) {
      if (x < startX || x >= endX || y < startY || y >= endY) {
        const idx = (rowOffset + x) * 4;
        const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        bgLumaSum += luma;
        bgPixelCount++;
      }
    }
  }
  const bgMeanLuma = bgPixelCount > 0 ? (bgLumaSum / bgPixelCount) : faceMeanLuma;

  // PRIORITY 8: Too dark (face mean luminance low or high near-black ratio)
  if (faceMeanLuma < config.minFaceLuminance || clippedLowRatio > config.maxClippedLowRatio) {
    return {
      state: 'too_dark',
      message: GUIDANCE_MESSAGES.too_dark,
      scores: { faceMeanLuma, clippedLowRatio },
      isReady: false
    };
  }

  // PRIORITY 9: Too bright / washed out (face mean luminance very high or high clipped ratio)
  // NEVER report "good" when clipped!
  if (faceMeanLuma > config.maxFaceLuminance || clippedHighRatio > config.maxClippedHighRatio) {
    return {
      state: 'too_bright',
      message: GUIDANCE_MESSAGES.too_bright,
      scores: { faceMeanLuma, clippedHighRatio },
      isReady: false
    };
  }

  // PRIORITY 10: Light behind you (backlight: background is significantly brighter than face)
  if ((bgMeanLuma - faceMeanLuma) > config.backlightLuminanceDiff) {
    return {
      state: 'backlight',
      message: GUIDANCE_MESSAGES.backlight,
      scores: { bgMeanLuma, faceMeanLuma, diff: bgMeanLuma - faceMeanLuma },
      isReady: false
    };
  }

  // -------------------------------------------------------------
  // SHARPNESS & BLUR (evaluated ONLY when exposure is acceptable!)
  // -------------------------------------------------------------
  const rawLaplacianVar = computeLaplacianVariance(grayCrop, cropW, cropH);
  // Normalize for luminance scaling
  const lumaNorm = faceMeanLuma > 0 ? (faceMeanLuma / 128) : 1;
  const normalizedLaplacian = rawLaplacianVar / Math.max(0.2, lumaNorm);

  // Smooth over ~5 frames
  const buffer = history.laplacianBuffer || [];
  buffer.push(normalizedLaplacian);
  if (buffer.length > config.blurSmoothingWindow) {
    buffer.shift();
  }
  history.laplacianBuffer = buffer;

  const smoothedLaplacian = buffer.reduce((a, b) => a + b, 0) / buffer.length;

  let consecutiveFails = history.consecutiveBlurCount || 0;
  if (smoothedLaplacian < config.laplacianMinVariance) {
    consecutiveFails++;
  } else {
    consecutiveFails = 0;
  }
  history.consecutiveBlurCount = consecutiveFails;

  // PRIORITY 11: Motion or blur (reported only after several consecutive failing frames)
  if (consecutiveFails >= config.consecutiveBlurFailsRequired) {
    return {
      state: 'motion_blur',
      message: GUIDANCE_MESSAGES.motion_blur,
      scores: {
        smoothedLaplacian,
        rawLaplacianVar,
        consecutiveFails
      },
      isReady: false
    };
  }

  // -------------------------------------------------------------
  // PRIORITY 12: Ready (all checks passed)
  // -------------------------------------------------------------
  return {
    state: 'ready',
    message: GUIDANCE_MESSAGES.ready,
    scores: {
      faceMeanLuma: Math.round(faceMeanLuma),
      clippedHighRatio: Math.round(clippedHighRatio * 100) / 100,
      clippedLowRatio: Math.round(clippedLowRatio * 100) / 100,
      blurScore: Math.round(smoothedLaplacian * 10) / 10,
      faceSizeRatio: Math.round(faceSizeRatio * 100) / 100,
      distFromCenter: Math.round(distFromCenter),
      status: 'pass'
    },
    isReady: true
  };
}

/**
 * State Hysteresis Controller
 * Ensures state changes only trigger when held steadily for ~600ms, preventing flicker.
 */
export class GuidanceHysteresis {
  constructor(holdDurationMs = ANALYSIS_CONFIG.stateHysteresisMs) {
    this.holdDurationMs = holdDurationMs;
    this.currentOutputState = 'no_face';
    this.pendingState = null;
    this.pendingSince = 0;
  }

  update(rawState, now = Date.now()) {
    if (rawState === this.currentOutputState) {
      this.pendingState = null;
      return this.currentOutputState;
    }

    if (this.pendingState !== rawState) {
      this.pendingState = rawState;
      this.pendingSince = now;
      return this.currentOutputState;
    }

    if ((now - this.pendingSince) >= this.holdDurationMs) {
      this.currentOutputState = rawState;
      this.pendingState = null;
    }

    return this.currentOutputState;
  }

  reset(initialState = 'no_face') {
    this.currentOutputState = initialState;
    this.pendingState = null;
    this.pendingSince = 0;
  }
}

/**
 * Evaluates quality of a captured still image during Review stage.
 */
export function analyzeStillQuality(imageData, faces) {
  const history = { laplacianBuffer: [], consecutiveBlurCount: 0 };
  const detected = faces && faces.length > 0 ? faces : detectFacesHeuristic(imageData, imageData.width, imageData.height);
  const res = analyzeFrameQuality(imageData, detected, history, { consecutiveBlurFailsRequired: 1 });

  const isBlurry = res.state === 'motion_blur';
  return {
    isBlurry,
    isGood: res.isReady,
    qualityScores: res.scores || {},
    guidanceText: isBlurry ? 'That one is a bit blurry. Retake?' : 'Looks good?'
  };
}
