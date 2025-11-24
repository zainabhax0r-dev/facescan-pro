import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import Webcam from 'react-webcam';
import { Camera, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { initializeFaceDetection, detectFaces, extractFaceEmbedding, checkLiveness } from '@/lib/face-detection';

export default function Enroll() {
  const { profile } = useAuth();
  const webcamRef = useRef<Webcam>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedFrames, setCapturedFrames] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);
  const [livenessScore, setLivenessScore] = useState(0);
  const [detectorReady, setDetectorReady] = useState(false);
  const [enrollmentComplete, setEnrollmentComplete] = useState(false);
  const targetFrames = 20;

  useEffect(() => {
    // Initialize face detection
    initializeFaceDetection()
      .then(() => setDetectorReady(true))
      .catch((err) => {
        console.error('Failed to initialize:', err);
        toast.error('Failed to initialize face detection');
      });
  }, []);

  useEffect(() => {
    if (!isCapturing || !detectorReady) return;

    const interval = setInterval(() => {
      captureFrame();
    }, 500); // Capture every 500ms

    return () => clearInterval(interval);
  }, [isCapturing, detectorReady, capturedFrames]);

  const captureFrame = async () => {
    if (!webcamRef.current?.video || capturedFrames >= targetFrames) return;

    try {
      const video = webcamRef.current.video;
      const detections = detectFaces(video);

      if (detections && detections.length > 0) {
        setFaceDetected(true);
        const detection = detections[0];
        
        // Check liveness
        const liveness = checkLiveness(detection);
        setLivenessScore(liveness.score);

        if (liveness.score >= 0.3) {
          setCapturedFrames(prev => prev + 1);
          
          if (capturedFrames + 1 >= targetFrames) {
            await completeEnrollment(video, detection);
          }
        }
      } else {
        setFaceDetected(false);
      }
    } catch (error) {
      console.error('Capture error:', error);
    }
  };

  const completeEnrollment = async (video: HTMLVideoElement, detection: any) => {
    setIsCapturing(false);
    
    try {
      toast.loading('Processing enrollment...');
      
      // Extract embedding
      const embedding = extractFaceEmbedding(detection, video);
      
      // Get face mesh points (simplified)
      const faceMeshPoints = [[detection.boundingBox.originX, detection.boundingBox.originY]];
      
      // Save to database
      const { error } = await supabase
        .from('face_embeddings')
        .upsert({
          user_id: profile?.id,
          embedding: embedding,
          face_mesh_points: faceMeshPoints,
          liveness_score: livenessScore,
        });

      if (error) throw error;

      toast.dismiss();
      toast.success('Face enrolled successfully!');
      setEnrollmentComplete(true);
    } catch (error: any) {
      toast.dismiss();
      toast.error(error.message || 'Failed to enroll face');
      setCapturedFrames(0);
    }
  };

  const startCapture = () => {
    if (!detectorReady) {
      toast.error('Face detector is not ready yet');
      return;
    }
    setCapturedFrames(0);
    setEnrollmentComplete(false);
    setIsCapturing(true);
    toast.info('Look at the camera and move your head slightly');
  };

  const progress = (capturedFrames / targetFrames) * 100;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Face Enrollment</h1>
        <p className="text-muted-foreground">
          Capture your face to enable attendance tracking
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Camera Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Camera Feed
            </CardTitle>
            <CardDescription>
              Position your face in the center of the frame
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
              <Webcam
                ref={webcamRef}
                audio={false}
                screenshotFormat="image/jpeg"
                videoConstraints={{
                  width: 1280,
                  height: 720,
                  facingMode: 'user',
                }}
                className="w-full h-full object-cover"
              />
              
              {isCapturing && (
                <div className="absolute inset-0 border-4 border-primary/50 rounded-lg animate-pulse" />
              )}
              
              {!detectorReady && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">Initializing detector...</p>
                  </div>
                </div>
              )}
            </div>

            {isCapturing && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{capturedFrames}/{targetFrames}</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            <div className="flex gap-2">
              {faceDetected && isCapturing && (
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md bg-success/10 text-success">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Face detected</span>
                </div>
              )}
              {!faceDetected && isCapturing && (
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md bg-warning/10 text-warning">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">No face detected</span>
                </div>
              )}
            </div>

            {!isCapturing && !enrollmentComplete && (
              <Button 
                onClick={startCapture} 
                className="w-full" 
                size="lg"
                disabled={!detectorReady}
              >
                <Camera className="h-5 w-5 mr-2" />
                Start Enrollment
              </Button>
            )}

            {enrollmentComplete && (
              <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-success" />
                  <div>
                    <p className="font-medium text-success">Enrollment Complete!</p>
                    <p className="text-sm text-muted-foreground">You can now mark attendance</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
            <CardDescription>Follow these steps for best results</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  1
                </div>
                <div>
                  <p className="font-medium">Good Lighting</p>
                  <p className="text-sm text-muted-foreground">
                    Ensure your face is well-lit and clearly visible
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  2
                </div>
                <div>
                  <p className="font-medium">Center Your Face</p>
                  <p className="text-sm text-muted-foreground">
                    Position your face in the center of the camera frame
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  3
                </div>
                <div>
                  <p className="font-medium">Slight Movement</p>
                  <p className="text-sm text-muted-foreground">
                    Move your head slightly left and right during capture
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  4
                </div>
                <div>
                  <p className="font-medium">Stay Still</p>
                  <p className="text-sm text-muted-foreground">
                    Keep a neutral expression and look at the camera
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm font-medium mb-2">Liveness Detection</p>
              <p className="text-sm text-muted-foreground">
                The system will verify you're a real person by detecting natural head movements.
                This prevents spoofing with photos or videos.
              </p>
            </div>

            {isCapturing && (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-sm font-medium mb-1">Capturing frames...</p>
                <p className="text-sm text-muted-foreground">
                  Liveness score: {(livenessScore * 100).toFixed(0)}%
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
