import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import Webcam from 'react-webcam';
import { 
  Scan as ScanIcon, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  User,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { 
  initializeAdvancedFaceDetection,
  detectAndExtractFace,
  cosineSimilarity,
  type FaceDetectionResult
} from '@/lib/advanced-face-detection';
import { format } from 'date-fns';

const SIMILARITY_THRESHOLD = 0.65; // More strict with advanced system

interface StoredEmbedding {
  user_id: string;
  embedding: number[];
  profiles: {
    full_name: string;
    email: string;
  };
}

export default function Scan() {
  const { profile } = useAuth();
  const webcamRef = useRef<Webcam>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [detectorReady, setDetectorReady] = useState(false);
  const [currentFace, setCurrentFace] = useState<FaceDetectionResult | null>(null);
  const [matchResult, setMatchResult] = useState<{
    matched: boolean;
    confidence: number;
    userName: string;
    userId: string;
  } | null>(null);
  const [allEmbeddings, setAllEmbeddings] = useState<StoredEmbedding[]>([]);
  const [scanAttempts, setScanAttempts] = useState(0);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initModels();
    fetchAllEmbeddings();

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, []);

  const initModels = async () => {
    try {
      await initializeAdvancedFaceDetection();
      setDetectorReady(true);
      toast.success('Face recognition system ready');
    } catch (err) {
      console.error('Failed to initialize:', err);
      toast.error('Failed to initialize face detection');
    }
  };

  const fetchAllEmbeddings = async () => {
    try {
      const { data, error } = await supabase
        .from('face_embeddings')
        .select(`
          user_id,
          embedding,
          profiles:user_id (
            full_name,
            email
          )
        `);

      if (error) throw error;
      setAllEmbeddings((data || []) as StoredEmbedding[]);
      console.log(`Loaded ${data?.length || 0} face embeddings`);
    } catch (error) {
      console.error('Error fetching embeddings:', error);
      toast.error('Failed to load face database');
    }
  };

  useEffect(() => {
    if (!isScanning || !detectorReady) return;

    scanIntervalRef.current = setInterval(() => {
      performScan();
    }, 800);

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [isScanning, detectorReady, allEmbeddings]);

  const performScan = async () => {
    if (!webcamRef.current?.video) return;

    const video = webcamRef.current.video;
    
    if (video.readyState !== 4) {
      console.log('Video not ready');
      return;
    }

    try {
      setScanAttempts(prev => prev + 1);
      const result = await detectAndExtractFace(video);

      if (result && result.detected && result.confidence > 0.85) {
        setCurrentFace(result);

        // Compare with all stored embeddings
        let bestMatch = {
          userId: '',
          userName: '',
          similarity: 0,
        };

        for (const stored of allEmbeddings) {
          const similarity = cosineSimilarity(result.embedding, stored.embedding);
          
          if (similarity > bestMatch.similarity) {
            bestMatch = {
              userId: stored.user_id,
              userName: stored.profiles?.full_name || 'Unknown',
              similarity,
            };
          }
        }

        console.log(`Best match: ${bestMatch.userName} (${(bestMatch.similarity * 100).toFixed(1)}%)`);

        // Log recognition attempt
        await supabase.from('recognition_logs').insert({
          user_id: bestMatch.similarity >= SIMILARITY_THRESHOLD ? bestMatch.userId : null,
          attempted_embedding: result.embedding,
          similarity_score: bestMatch.similarity,
          success: bestMatch.similarity >= SIMILARITY_THRESHOLD,
          device_info: navigator.userAgent,
        });

        if (bestMatch.similarity >= SIMILARITY_THRESHOLD) {
          // Match found!
          setMatchResult({
            matched: true,
            confidence: bestMatch.similarity,
            userName: bestMatch.userName,
            userId: bestMatch.userId,
          });

          // Mark attendance
          await markAttendance(bestMatch.userId, bestMatch.similarity);
          setLastScanTime(new Date());
          setIsScanning(false);
          
          if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
          }
        } else {
          setMatchResult({
            matched: false,
            confidence: bestMatch.similarity,
            userName: '',
            userId: '',
          });
        }
      } else {
        setCurrentFace(null);
      }
    } catch (error) {
      console.error('Scan error:', error);
    }
  };

  const markAttendance = async (userId: string, confidence: number) => {
    try {
      // Check if already marked today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: existing } = await supabase
        .from('attendance_records')
        .select('id, timestamp')
        .eq('user_id', userId)
        .gte('timestamp', today.toISOString())
        .maybeSingle();

      if (existing) {
        toast.info(
          `Attendance already marked today at ${format(new Date(existing.timestamp), 'HH:mm')}`,
          { duration: 5000 }
        );
        return;
      }

      // Create attendance record
      const { error } = await supabase
        .from('attendance_records')
        .insert({
          user_id: userId,
          confidence: confidence,
          device_info: navigator.userAgent,
        });

      if (error) throw error;

      toast.success('✓ Attendance marked successfully!', {
        description: `Recorded at ${format(new Date(), 'HH:mm:ss')}`,
        duration: 5000,
      });
    } catch (error: any) {
      console.error('Error marking attendance:', error);
      toast.error(error.message || 'Failed to mark attendance');
    }
  };

  const startScanning = () => {
    if (!detectorReady) {
      toast.error('Face recognition system is not ready yet');
      return;
    }

    if (allEmbeddings.length === 0) {
      toast.error('No enrolled faces found. Please enroll first.');
      return;
    }

    setMatchResult(null);
    setCurrentFace(null);
    setScanAttempts(0);
    setIsScanning(true);
    toast.info('Scanning... Please look at the camera');
  };

  const stopScanning = () => {
    setIsScanning(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
          Face Recognition Scanner
        </h1>
        <p className="text-muted-foreground text-lg">
          Scan your face to mark attendance instantly
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Scanner Section */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="overflow-hidden shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScanIcon className="h-5 w-5 text-primary" />
                Live Scanner
              </CardTitle>
              <CardDescription>
                Position your face in the center for recognition
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
                />
                
                {isScanning && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 border-4 border-primary/40 rounded-lg" />
                    <div className="absolute inset-12 border-2 border-secondary/60 rounded-full animate-ping" />
                    
                    {currentFace?.boundingBox && (
                      <svg className="absolute inset-0 w-full h-full">
                        <rect
                          x={currentFace.boundingBox.topLeft[0]}
                          y={currentFace.boundingBox.topLeft[1]}
                          width={
                            currentFace.boundingBox.bottomRight[0] -
                            currentFace.boundingBox.topLeft[0]
                          }
                          height={
                            currentFace.boundingBox.bottomRight[1] -
                            currentFace.boundingBox.topLeft[1]
                          }
                          fill="none"
                          stroke="#00ff00"
                          strokeWidth="4"
                          rx="8"
                        />
                      </svg>
                    )}
                  </div>
                )}
                
                {!detectorReady && (
                  <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                      <p className="text-white font-medium">Loading AI Models...</p>
                    </div>
                  </div>
                )}

                {isScanning && (
                  <div className="absolute top-4 left-4 right-4 flex justify-between">
                    <Badge variant="default" className="text-sm">
                      <ScanIcon className="h-3 w-3 mr-1 animate-pulse" />
                      Scanning...
                    </Badge>
                    <Badge variant="secondary" className="text-sm">
                      {scanAttempts} attempts
                    </Badge>
                  </div>
                )}
              </div>

              {matchResult && (
                <Alert className={
                  matchResult.matched 
                    ? 'border-success/50 bg-success/10' 
                    : 'border-destructive/50 bg-destructive/10'
                }>
                  <div className="flex items-start gap-3">
                    {matchResult.matched ? (
                      <CheckCircle className="h-6 w-6 text-success mt-0.5" />
                    ) : (
                      <XCircle className="h-6 w-6 text-destructive mt-0.5" />
                    )}
                    <div className="flex-1">
                      <AlertDescription>
                        {matchResult.matched ? (
                          <div className="space-y-2">
                            <p className="text-lg font-bold text-success">
                              Recognition Successful!
                            </p>
                            <p className="text-foreground font-medium">
                              Welcome, {matchResult.userName}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Match confidence: {(matchResult.confidence * 100).toFixed(1)}%
                            </p>
                            {lastScanTime && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(lastScanTime, 'PPpp')}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-lg font-bold text-destructive">
                              No Match Found
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Face not recognized. Please try again or enroll your face first.
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Best match: {(matchResult.confidence * 100).toFixed(1)}%
                            </p>
                          </div>
                        )}
                      </AlertDescription>
                    </div>
                  </div>
                </Alert>
              )}

              <div className="flex gap-2">
                {!isScanning ? (
                  <Button 
                    onClick={startScanning} 
                    className="flex-1 h-12" 
                    size="lg"
                    disabled={!detectorReady || allEmbeddings.length === 0}
                  >
                    <ScanIcon className="h-5 w-5 mr-2" />
                    Start Scanning
                  </Button>
                ) : (
                  <Button 
                    onClick={stopScanning} 
                    variant="destructive"
                    className="flex-1 h-12" 
                    size="lg"
                  >
                    Stop Scanning
                  </Button>
                )}
              </div>

              {allEmbeddings.length === 0 && detectorReady && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No faces enrolled yet. Please enroll at least one face before scanning.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Status Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">System Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">AI System</span>
                <Badge variant={detectorReady ? 'default' : 'secondary'}>
                  {detectorReady ? 'Ready' : 'Loading'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Enrolled Faces</span>
                <Badge variant="outline" className="font-mono">
                  {allEmbeddings.length}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Threshold</span>
                <Badge variant="outline">
                  {(SIMILARITY_THRESHOLD * 100).toFixed(0)}%
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={isScanning ? 'default' : 'secondary'}>
                  {isScanning ? 'Scanning' : 'Idle'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Detection Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {currentFace ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Face Detected</span>
                    <CheckCircle className="h-5 w-5 text-success" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Confidence</span>
                    <span className="text-sm font-bold text-primary">
                      {(currentFace.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Landmarks</span>
                    <span className="text-sm font-mono">
                      {currentFace.landmarks.length}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <User className="h-12 w-12 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No face detected
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>✓ Ensure good lighting</p>
              <p>✓ Look directly at camera</p>
              <p>✓ Remove any obstructions</p>
              <p>✓ Stay still during scan</p>
              <p>✓ Be within 2 feet of camera</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
