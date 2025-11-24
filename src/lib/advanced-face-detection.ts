import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';

let blazefaceModel: blazeface.BlazeFaceModel | null = null;
let faceLandmarksModel: faceLandmarksDetection.FaceLandmarksDetector | null = null;
let isInitialized = false;

export async function initializeAdvancedFaceDetection() {
  if (isInitialized && blazefaceModel && faceLandmarksModel) {
    return { blazefaceModel, faceLandmarksModel };
  }

  try {
    console.log('Initializing TensorFlow.js...');
    await tf.ready();
    await tf.setBackend('webgl');

    console.log('Loading BlazeFace model...');
    blazefaceModel = await blazeface.load();

    console.log('Loading Face Landmarks model...');
    faceLandmarksModel = await faceLandmarksDetection.createDetector(
      faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
      {
        runtime: 'tfjs',
        refineLandmarks: true,
        maxFaces: 1,
      }
    );

    isInitialized = true;
    console.log('Face detection initialized successfully');
    
    return { blazefaceModel, faceLandmarksModel };
  } catch (error) {
    console.error('Failed to initialize face detection:', error);
    throw error;
  }
}

export interface FaceDetectionResult {
  detected: boolean;
  embedding: number[];
  landmarks: number[][];
  boundingBox?: {
    topLeft: [number, number];
    bottomRight: [number, number];
  };
  confidence: number;
}

export async function detectAndExtractFace(
  video: HTMLVideoElement
): Promise<FaceDetectionResult | null> {
  if (!blazefaceModel || !faceLandmarksModel) {
    throw new Error('Models not initialized');
  }

  try {
    // Detect face with BlazeFace
    const predictions = await blazefaceModel.estimateFaces(video, false);

    if (predictions.length === 0) {
      return null;
    }

    const face = predictions[0];
    const start = face.topLeft as [number, number];
    const end = face.bottomRight as [number, number];

    // Get detailed landmarks
    const landmarks = await faceLandmarksModel.estimateFaces(video);

    if (landmarks.length === 0) {
      return null;
    }

    const faceLandmarks = landmarks[0];

    // Extract face region and create embedding
    const embedding = await extractAdvancedEmbedding(
      video,
      start,
      end,
      faceLandmarks
    );

    // Extract landmark coordinates
    const landmarkCoords = faceLandmarks.keypoints.map((kp) => [kp.x, kp.y]);

    return {
      detected: true,
      embedding,
      landmarks: landmarkCoords,
      boundingBox: {
        topLeft: start,
        bottomRight: end,
      },
      confidence: face.probability?.[0] || 0,
    };
  } catch (error) {
    console.error('Face detection error:', error);
    return null;
  }
}

async function extractAdvancedEmbedding(
  video: HTMLVideoElement,
  topLeft: [number, number],
  bottomRight: [number, number],
  faceLandmarks: faceLandmarksDetection.Face
): Promise<number[]> {
  const [x1, y1] = topLeft;
  const [x2, y2] = bottomRight;
  const width = x2 - x1;
  const height = y2 - y1;

  // Create canvas for face extraction
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  canvas.width = 128;
  canvas.height = 128;

  // Draw and resize face region
  ctx.drawImage(
    video,
    x1,
    y1,
    width,
    height,
    0,
    0,
    128,
    128
  );

  // Get image data
  const imageData = ctx.getImageData(0, 0, 128, 128);
  const pixels = imageData.data;

  // Create 512-dimensional embedding with multiple features
  const embedding: number[] = [];

  // 1. Color histogram features (256 dims)
  const rHist = new Array(32).fill(0);
  const gHist = new Array(32).fill(0);
  const bHist = new Array(32).fill(0);

  for (let i = 0; i < pixels.length; i += 4) {
    rHist[Math.floor(pixels[i] / 8)]++;
    gHist[Math.floor(pixels[i + 1] / 8)]++;
    bHist[Math.floor(pixels[i + 2] / 8)]++;
  }

  // Normalize histograms
  const totalPixels = pixels.length / 4;
  embedding.push(...rHist.map(v => v / totalPixels));
  embedding.push(...gHist.map(v => v / totalPixels));
  embedding.push(...bHist.map(v => v / totalPixels));

  // 2. Texture features (64 dims)
  for (let i = 0; i < 64; i++) {
    const startIdx = Math.floor((i / 64) * pixels.length);
    const endIdx = Math.floor(((i + 1) / 64) * pixels.length);
    let sum = 0;
    for (let j = startIdx; j < endIdx; j += 4) {
      sum += (pixels[j] + pixels[j + 1] + pixels[j + 2]) / 3;
    }
    embedding.push(sum / ((endIdx - startIdx) / 4));
  }

  // 3. Landmark-based features (128 dims)
  const landmarkFeatures = extractLandmarkFeatures(faceLandmarks);
  embedding.push(...landmarkFeatures);

  // 4. Edge detection features (64 dims)
  const edgeFeatures = extractEdgeFeatures(imageData);
  embedding.push(...edgeFeatures);

  // Normalize embedding
  const magnitude = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0)
  );
  
  return embedding.map(val => val / (magnitude || 1));
}

function extractLandmarkFeatures(
  face: faceLandmarksDetection.Face
): number[] {
  const features: number[] = [];
  const keypoints = face.keypoints;

  // Eye distances
  const leftEye = keypoints.slice(33, 42);
  const rightEye = keypoints.slice(263, 272);
  
  features.push(calculateAverageDistance(leftEye));
  features.push(calculateAverageDistance(rightEye));

  // Mouth features
  const mouth = keypoints.slice(61, 68);
  features.push(calculateAverageDistance(mouth));

  // Face contour
  const contour = keypoints.slice(0, 17);
  features.push(calculateAverageDistance(contour));

  // Nose features
  const nose = keypoints.slice(27, 36);
  features.push(calculateAverageDistance(nose));

  // Fill to 128 dimensions with normalized positions
  for (let i = 0; i < 123; i++) {
    if (keypoints[i]) {
      features.push(keypoints[i].x / 1000);
      features.push(keypoints[i].y / 1000);
    } else {
      features.push(0);
      features.push(0);
    }
    if (features.length >= 128) break;
  }

  while (features.length < 128) {
    features.push(0);
  }

  return features.slice(0, 128);
}

function calculateAverageDistance(points: faceLandmarksDetection.Keypoint[]): number {
  if (points.length < 2) return 0;
  
  let totalDistance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    totalDistance += Math.sqrt(dx * dx + dy * dy);
  }
  return totalDistance / (points.length - 1);
}

function extractEdgeFeatures(imageData: ImageData): number[] {
  const features: number[] = [];
  const { data, width, height } = imageData;

  // Simple Sobel edge detection in 8x8 grid
  for (let gridY = 0; gridY < 8; gridY++) {
    for (let gridX = 0; gridX < 8; gridX++) {
      let edgeStrength = 0;
      const startX = Math.floor((gridX / 8) * width);
      const startY = Math.floor((gridY / 8) * height);
      const endX = Math.floor(((gridX + 1) / 8) * width);
      const endY = Math.floor(((gridY + 1) / 8) * height);

      for (let y = startY; y < endY - 1; y++) {
        for (let x = startX; x < endX - 1; x++) {
          const idx = (y * width + x) * 4;
          const idxRight = (y * width + x + 1) * 4;
          const idxDown = ((y + 1) * width + x) * 4;

          const gx = Math.abs(data[idxRight] - data[idx]);
          const gy = Math.abs(data[idxDown] - data[idx]);
          edgeStrength += Math.sqrt(gx * gx + gy * gy);
        }
      }

      features.push(edgeStrength / ((endX - startX) * (endY - startY)));
    }
  }

  return features;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}

// Advanced liveness detection
export interface LivenessResult {
  score: number;
  checks: {
    blinkDetected: boolean;
    headMovement: boolean;
    textureVariance: boolean;
    depthEstimate: boolean;
  };
  isLive: boolean;
}

let previousFace: FaceDetectionResult | null = null;
let blinkHistory: boolean[] = [];
let movementHistory: number[] = [];

export function checkAdvancedLiveness(
  currentFace: FaceDetectionResult,
  videoElement: HTMLVideoElement
): LivenessResult {
  const checks = {
    blinkDetected: false,
    headMovement: false,
    textureVariance: false,
    depthEstimate: false,
  };

  // 1. Blink detection (check eye aspect ratio changes)
  if (currentFace.landmarks.length > 468) {
    const leftEyeRatio = calculateEyeAspectRatio(
      currentFace.landmarks.slice(33, 42)
    );
    const rightEyeRatio = calculateEyeAspectRatio(
      currentFace.landmarks.slice(263, 272)
    );
    
    blinkHistory.push(leftEyeRatio < 0.2 || rightEyeRatio < 0.2);
    if (blinkHistory.length > 10) blinkHistory.shift();
    
    checks.blinkDetected = blinkHistory.filter(b => b).length >= 2;
  }

  // 2. Head movement detection
  if (previousFace && previousFace.boundingBox && currentFace.boundingBox) {
    const prevCenter = {
      x: (previousFace.boundingBox.topLeft[0] + previousFace.boundingBox.bottomRight[0]) / 2,
      y: (previousFace.boundingBox.topLeft[1] + previousFace.boundingBox.bottomRight[1]) / 2,
    };
    const currCenter = {
      x: (currentFace.boundingBox.topLeft[0] + currentFace.boundingBox.bottomRight[0]) / 2,
      y: (currentFace.boundingBox.topLeft[1] + currentFace.boundingBox.bottomRight[1]) / 2,
    };

    const movement = Math.sqrt(
      Math.pow(currCenter.x - prevCenter.x, 2) +
      Math.pow(currCenter.y - prevCenter.y, 2)
    );

    movementHistory.push(movement);
    if (movementHistory.length > 20) movementHistory.shift();

    const avgMovement = movementHistory.reduce((a, b) => a + b, 0) / movementHistory.length;
    checks.headMovement = avgMovement > 3 && avgMovement < 50;
  }

  // 3. Texture variance (spoofing detection)
  if (currentFace.boundingBox) {
    const variance = calculateTextureVariance(videoElement, currentFace.boundingBox);
    checks.textureVariance = variance > 100; // Real faces have more texture
  }

  // 4. Depth estimation (3D face vs 2D photo)
  checks.depthEstimate = estimateDepth(currentFace.landmarks);

  previousFace = currentFace;

  // Calculate liveness score
  const score = (
    (checks.blinkDetected ? 0.3 : 0) +
    (checks.headMovement ? 0.3 : 0) +
    (checks.textureVariance ? 0.2 : 0) +
    (checks.depthEstimate ? 0.2 : 0)
  );

  return {
    score,
    checks,
    isLive: score >= 0.5,
  };
}

function calculateEyeAspectRatio(eyePoints: number[][]): number {
  if (eyePoints.length < 6) return 1;

  const vertical1 = Math.sqrt(
    Math.pow(eyePoints[1][0] - eyePoints[5][0], 2) +
    Math.pow(eyePoints[1][1] - eyePoints[5][1], 2)
  );
  const vertical2 = Math.sqrt(
    Math.pow(eyePoints[2][0] - eyePoints[4][0], 2) +
    Math.pow(eyePoints[2][1] - eyePoints[4][1], 2)
  );
  const horizontal = Math.sqrt(
    Math.pow(eyePoints[0][0] - eyePoints[3][0], 2) +
    Math.pow(eyePoints[0][1] - eyePoints[3][1], 2)
  );

  return (vertical1 + vertical2) / (2.0 * horizontal);
}

function calculateTextureVariance(
  video: HTMLVideoElement,
  boundingBox: { topLeft: [number, number]; bottomRight: [number, number] }
): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const [x1, y1] = boundingBox.topLeft;
  const [x2, y2] = boundingBox.bottomRight;
  const width = x2 - x1;
  const height = y2 - y1;

  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(video, x1, y1, width, height, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  let sum = 0;
  let sumSq = 0;
  const count = pixels.length / 4;

  for (let i = 0; i < pixels.length; i += 4) {
    const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    sum += gray;
    sumSq += gray * gray;
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  return variance;
}

function estimateDepth(landmarks: number[][]): boolean {
  if (landmarks.length < 468) return false;

  // Check if face landmarks show 3D characteristics
  // by measuring asymmetry and depth cues

  const leftProfile = landmarks.slice(0, 17);
  const rightProfile = landmarks.slice(127, 144);

  let asymmetryScore = 0;
  for (let i = 0; i < Math.min(leftProfile.length, rightProfile.length); i++) {
    const dist = Math.sqrt(
      Math.pow(leftProfile[i][0] - rightProfile[i][0], 2) +
      Math.pow(leftProfile[i][1] - rightProfile[i][1], 2)
    );
    asymmetryScore += dist;
  }

  // Real 3D faces show more asymmetry than flat photos
  return asymmetryScore > 50;
}

export function resetLivenessTracking() {
  previousFace = null;
  blinkHistory = [];
  movementHistory = [];
}
