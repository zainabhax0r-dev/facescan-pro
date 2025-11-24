import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import Webcam from 'react-webcam';
import { 
  Camera, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Eye,
  Move,
  Layers,
  Scan
} from 'lucide-react';
import {
  initializeAdvancedFaceDetection,
  detectAndExtractFace,
  checkAdvancedLiveness,
  resetLivenessTracking,
  type FaceDetectionResult,
  type LivenessResult
} from '@/lib/advanced-face-detection';

export default function Enroll() {
  const { profile } = useAuth();
  const webcamRef = useRef<Webcam>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedFrames, setCapturedFrames] = useState(0);
  const [currentFace, setCurrentFace] = useState<FaceDetectionResult | null>(null);
  const [liveness, setLiveness] = useState<LivenessResult | null>(null);
  const [detectorReady, setDetectorReady] = useState(false);
  const [enrollmentComplete, setEnrollmentComplete] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [allEmbeddings, setAllEmbeddings] = useState<number[][]>([]);
  const targetFrames = 15;
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initModels();
    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    };
  }, []);

  const initModels = async () => {
    try {
      setInitError(null);
      await initializeAdvancedFaceDetection();
      setDetectorReady(true);
      toast.success('Face detection ready!');
    } catch (err: any) {
      console.error('Initialization error:', err);
      setInitError(err.message || 'Failed to initialize');
      toast.error('Failed to initialize face detection');
    }
  };

  useEffect(() => {
    if (!isCapturing || !detectorReady) return;

    captureIntervalRef.current = setInterval(() => {
      captureFrame();
    }, 400);

    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    };
  }, [isCapturing, detectorReady, capturedFrames]);

  const captureFrame = async () => {
    if (!webcamRef.current?.video || capturedFrames >= targetFrames) return;

    const video = webcamRef.current.video;
    
    // Check if video is ready
    if (video.readyState !== 4) {
      console.log('Video not ready yet');
      return;
    }

    try {
      const result = await detectAndExtractFace(video);

      if (result && result.detected) {
        setCurrentFace(result);
        
        const livenessResult = checkAdvancedLiveness(result, video);
        setLiveness(livenessResult);

        if (livenessResult.isLive && result.confidence > 0.8) {
          setAllEmbeddings(prev => [...prev, result.embedding]);
          setCapturedFrames(prev => prev + 1);
          
          if (capturedFrames + 1 >= targetFrames) {
            await completeEnrollment([...allEmbeddings, result.embedding], result);
          }
        }
      } else {
        setCurrentFace(null);
      }
    } catch (error) {
      console.error('Capture error:', error);
    }
  };

  const completeEnrollment = async (embeddings: number[][], lastResult: FaceDetectionResult) => {
    setIsCapturing(false);
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
    }
    
    try {
      toast.loading('Processing enrollment...', { id: 'enroll' });
      
      // Average all embeddings for better accuracy
      const avgEmbedding = averageEmbeddings(embeddings);
      
      // Save to database
      const { error } = await supabase
        .from('face_embeddings')
        .upsert({
          user_id: profile?.id,
          embedding: avgEmbedding,
          face_mesh_points: lastResult.landmarks,
          liveness_score: liveness?.score || 0,
        });

      if (error) throw error;

      toast.success('Face enrolled successfully!', { id: 'enroll' });
      setEnrollmentComplete(true);
      resetLivenessTracking();
    } catch (error: any) {
      toast.error(error.message || 'Failed to enroll face', { id: 'enroll' });
      setCapturedFrames(0);
      setAllEmbeddings([]);
    }
  };

  const averageEmbeddings = (embeddings: number[][]): number[] => {
    if (embeddings.length === 0) return [];
    
    const avgEmbedding = new Array(embeddings[0].length).fill(0);
    
    for (const embedding of embeddings) {
      for (let i = 0; i < embedding.length; i++) {
        avgEmbedding[i] += embedding[i];
      }
    }
    
    return avgEmbedding.map(val => val / embeddings.length);
  };

  const startCapture = () => {
    if (!detectorReady) {
      toast.error('Face detector is not ready yet');
      return;
    }
    setCapturedFrames(0);
    setAllEmbeddings([]);
    setEnrollmentComplete(false);
    setCurrentFace(null);
    setLiveness(null);
    resetLivenessTracking();
    setIsCapturing(true);
    toast.info('Look at the camera and move your head slightly');
  };

  const stopCapture = () => {
    setIsCapturing(false);
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
    }
    resetLivenessTracking();
  };

  const progress = (capturedFrames / targetFrames) * 100;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
          Advanced Face Enrollment
        </h1>
        <p className="text-muted-foreground text-lg">
          AI-powered face capture with anti-spoofing technology
        </p>
      </div>

      {initError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {initError}
            <Button
              variant="outline"
              size="sm"
              onClick={initModels}
              className="ml-4"
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Camera Section */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="overflow-hidden shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-primary" />
                Live Camera Feed
              </CardTitle>
              <CardDescription>
                Position your face in the center and follow the prompts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
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
                  onUserMedia={() => console.log('Webcam ready')}
                />
                
                {isCapturing && currentFace && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 border-4 border-primary/50 rounded-lg animate-pulse" />
                    <svg className="absolute inset-0 w-full h-full">
                      <rect
                        x={currentFace.boundingBox?.topLeft[0]}
                        y={currentFace.boundingBox?.topLeft[1]}
                        width={
                          (currentFace.boundingBox?.bottomRight[0] || 0) -
                          (currentFace.boundingBox?.topLeft[0] || 0)
                        }
                        height={
                          (currentFace.boundingBox?.bottomRight[1] || 0) -
                          (currentFace.boundingBox?.topLeft[1] || 0)
                        }
                        fill="none"
                        stroke="#00ff00"
                        strokeWidth="3"
                        className="animate-pulse"
                      />
                    </svg>
                  </div>
                )}
                
                {!detectorReady && (
                  <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                      <p className="text-white font-medium">Initializing AI Models...</p>
                      <p className="text-sm text-gray-400">This may take a moment</p>
                    </div>
                  </div>
                )}
              </div>

              {isCapturing && (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground font-medium">Capture Progress</span>
                    <span className="font-bold text-primary">{capturedFrames}/{targetFrames} frames</span>
                  </div>
                  <Progress value={progress} className="h-3" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {currentFace && (
                  <>
                    <div className={`p-3 rounded-lg border ${
                      currentFace.detected 
                        ? 'bg-success/10 border-success/30' 
                        : 'bg-muted border-border'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Scan className={`h-5 w-5 ${currentFace.detected ? 'text-success' : 'text-muted-foreground'}`} />
                        <div>
                          <p className="text-sm font-medium">Face Detected</p>
                          <p className="text-xs text-muted-foreground">
                            {(currentFace.confidence * 100).toFixed(1)}% confidence
                          </p>
                        </div>
                      </div>
                    </div>

                    {liveness && (
                      <div className={`p-3 rounded-lg border ${
                        liveness.isLive
                          ? 'bg-success/10 border-success/30' 
                          : 'bg-warning/10 border-warning/30'
                      }`}>
                        <div className="flex items-center gap-2">
                          <CheckCircle className={`h-5 w-5 ${liveness.isLive ? 'text-success' : 'text-warning'}`} />
                          <div>
                            <p className="text-sm font-medium">Liveness</p>
                            <p className="text-xs text-muted-foreground">
                              {(liveness.score * 100).toFixed(0)}% score
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex gap-2">
                {!isCapturing && !enrollmentComplete && (
                  <Button 
                    onClick={startCapture} 
                    className="flex-1 h-12" 
                    size="lg"
                    disabled={!detectorReady}
                  >
                    <Camera className="h-5 w-5 mr-2" />
                    Start Enrollment
                  </Button>
                )}

                {isCapturing && (
                  <Button 
                    onClick={stopCapture} 
                    variant="destructive"
                    className="flex-1 h-12" 
                    size="lg"
                  >
                    Stop Capture
                  </Button>
                )}

                {enrollmentComplete && (
                  <Button 
                    onClick={startCapture} 
                    variant="outline"
                    className="flex-1 h-12" 
                    size="lg"
                  >
                    Re-enroll Face
                  </Button>
                )}
              </div>

              {enrollmentComplete && (
                <Alert className="border-success/50 bg-success/10">
                  <CheckCircle className="h-5 w-5 text-success" />
                  <AlertDescription className="text-success font-medium">
                    Enrollment complete! You can now mark attendance by scanning your face.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">System Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">AI Models</span>
                <Badge variant={detectorReady ? 'default' : 'secondary'}>
                  {detectorReady ? 'Ready' : 'Loading'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Camera</span>
                <Badge variant={webcamRef.current ? 'default' : 'secondary'}>
                  {webcamRef.current ? 'Active' : 'Waiting'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={isCapturing ? 'default' : 'outline'}>
                  {isCapturing ? 'Capturing' : 'Idle'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                Liveness Checks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Eye className={`h-4 w-4 ${liveness?.checks.blinkDetected ? 'text-success' : 'text-muted-foreground'}`} />
                <span className={liveness?.checks.blinkDetected ? 'text-success' : 'text-muted-foreground'}>
                  Blink Detection
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Move className={`h-4 w-4 ${liveness?.checks.headMovement ? 'text-success' : 'text-muted-foreground'}`} />
                <span className={liveness?.checks.headMovement ? 'text-success' : 'text-muted-foreground'}>
                  Head Movement
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Layers className={`h-4 w-4 ${liveness?.checks.textureVariance ? 'text-success' : 'text-muted-foreground'}`} />
                <span className={liveness?.checks.textureVariance ? 'text-success' : 'text-muted-foreground'}>
                  Texture Analysis
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Scan className={`h-4 w-4 ${liveness?.checks.depthEstimate ? 'text-success' : 'text-muted-foreground'}`} />
                <span className={liveness?.checks.depthEstimate ? 'text-success' : 'text-muted-foreground'}>
                  3D Depth Check
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>✓ Ensure good lighting</p>
              <p>✓ Remove glasses if possible</p>
              <p>✓ Look directly at camera</p>
              <p>✓ Move head slightly during capture</p>
              <p>✓ Blink naturally</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
