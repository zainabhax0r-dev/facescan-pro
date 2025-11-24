import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

let faceDetector: FaceDetector | null = null;

export async function initializeFaceDetection() {
  if (faceDetector) return faceDetector;
  
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );
    
    faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5
    });
    
    return faceDetector;
  } catch (error) {
    console.error('Failed to initialize face detection:', error);
    throw error;
  }
}

export function detectFaces(video: HTMLVideoElement) {
  if (!faceDetector) {
    throw new Error('Face detector not initialized');
  }
  
  const result = faceDetector.detectForVideo(video, performance.now());
  return result.detections;
}

// Extract face embedding from detection
export function extractFaceEmbedding(detection: any, video: HTMLVideoElement): number[] {
  // Get face bounding box
  const bbox = detection.boundingBox;
  
  // Create canvas to extract face region
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  canvas.width = bbox.width;
  canvas.height = bbox.height;
  
  // Draw face region
  ctx.drawImage(
    video,
    bbox.originX,
    bbox.originY,
    bbox.width,
    bbox.height,
    0,
    0,
    bbox.width,
    bbox.height
  );
  
  // Get image data and create simple embedding
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  
  // Create a 128-dimensional embedding by averaging pixel regions
  const embedding: number[] = [];
  const regionSize = Math.floor(pixels.length / 128 / 4); // 4 channels per pixel
  
  for (let i = 0; i < 128; i++) {
    let sum = 0;
    const start = i * regionSize * 4;
    const end = Math.min(start + regionSize * 4, pixels.length);
    
    for (let j = start; j < end; j += 4) {
      // Average RGB values
      sum += (pixels[j] + pixels[j + 1] + pixels[j + 2]) / 3;
    }
    
    embedding.push(sum / regionSize);
  }
  
  // Normalize embedding
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / magnitude);
}

// Calculate cosine similarity between two embeddings
export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have same length');
  }
  
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    magnitude1 += embedding1[i] * embedding1[i];
    magnitude2 += embedding2[i] * embedding2[i];
  }
  
  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);
  
  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  
  return dotProduct / (magnitude1 * magnitude2);
}

// Liveness detection - simple blink/movement check
export interface LivenessCheck {
  blinkDetected: boolean;
  movementDetected: boolean;
  score: number;
}

let previousDetection: any = null;

export function checkLiveness(detection: any): LivenessCheck {
  let blinkDetected = false;
  let movementDetected = false;
  
  // Check for movement by comparing with previous detection
  if (previousDetection) {
    const currentCenter = {
      x: detection.boundingBox.originX + detection.boundingBox.width / 2,
      y: detection.boundingBox.originY + detection.boundingBox.height / 2
    };
    
    const previousCenter = {
      x: previousDetection.boundingBox.originX + previousDetection.boundingBox.width / 2,
      y: previousDetection.boundingBox.originY + previousDetection.boundingBox.height / 2
    };
    
    const movement = Math.sqrt(
      Math.pow(currentCenter.x - previousCenter.x, 2) +
      Math.pow(currentCenter.y - previousCenter.y, 2)
    );
    
    movementDetected = movement > 5; // Threshold for movement
  }
  
  previousDetection = detection;
  
  // Simple liveness score (can be enhanced)
  const score = (blinkDetected ? 0.5 : 0) + (movementDetected ? 0.5 : 0);
  
  return { blinkDetected, movementDetected, score };
}
