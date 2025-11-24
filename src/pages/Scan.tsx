import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import Webcam from 'react-webcam';
import { Scan as ScanIcon, CheckCircle, XCircle, Loader2, User } from 'lucide-react';
import { 
  initializeFaceDetection, 
  detectFaces, 
  extractFaceEmbedding,
  cosineSimilarity 
} from '@/lib/face-detection';

const SIMILARITY_THRESHOLD = 0.38;

export default function Scan() {
  const { profile } = useAuth();
  const webcamRef = useRef<Webcam>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [detectorReady, setDetectorReady] = useState(false);
  const [matchResult, setMatchResult] = useState<{
    matched: boolean;
    confidence: number;
    userName: string;
    userId: string;
  } | null>(null);
  const [allEmbeddings, setAllEmbeddings] = useState<any[]>([]);

  useEffect(() => {
    initializeFaceDetection()
      .then(() => setDetectorReady(true))
      .catch((err) => {
        console.error('Failed to initialize:', err);
        toast.error('Failed to initialize face detection');
      });

    fetchAllEmbeddings();
  }, []);

  useEffect(() => {
    if (!isScanning || !detectorReady) return;

    const interval = setInterval(() => {
      performScan();
    }, 1000);

    return () => clearInterval(interval);
  }, [isScanning, detectorReady]);

  const fetchAllEmbeddings = async () => {
    try {
      const { data, error } = await supabase
        .from('face_embeddings')
        .select(`
          *,
          profiles:user_id (
            full_name,
            email
          )
        `);

      if (error) throw error;
      setAllEmbeddings(data || []);
    } catch (error) {
      console.error('Error fetching embeddings:', error);
    }
  };

  const performScan = async () => {
    if (!webcamRef.current?.video) return;

    try {
      const video = webcamRef.current.video;
      const detections = detectFaces(video);

      if (detections && detections.length > 0) {
        const detection = detections[0];
        const currentEmbedding = extractFaceEmbedding(detection, video);

        // Compare with all stored embeddings
        let bestMatch = {
          userId: '',
          userName: '',
          similarity: 0,
        };

        for (const stored of allEmbeddings) {
          const similarity = cosineSimilarity(currentEmbedding, stored.embedding);
          
          if (similarity > bestMatch.similarity) {
            bestMatch = {
              userId: stored.user_id,
              userName: stored.profiles?.full_name || 'Unknown',
              similarity,
            };
          }
        }

        // Log recognition attempt
        await supabase.from('recognition_logs').insert({
          user_id: bestMatch.similarity >= SIMILARITY_THRESHOLD ? bestMatch.userId : null,
          attempted_embedding: currentEmbedding,
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
          
          setIsScanning(false);
        } else {
          setMatchResult({
            matched: false,
            confidence: bestMatch.similarity,
            userName: '',
            userId: '',
          });
        }
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
        .select('id')
        .eq('user_id', userId)
        .gte('timestamp', today.toISOString())
        .maybeSingle();

      if (existing) {
        toast.info('Attendance already marked for today');
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

      toast.success('Attendance marked successfully!');
    } catch (error: any) {
      console.error('Error marking attendance:', error);
      toast.error(error.message || 'Failed to mark attendance');
    }
  };

  const startScanning = () => {
    if (!detectorReady) {
      toast.error('Face detector is not ready yet');
      return;
    }
    setMatchResult(null);
    setIsScanning(true);
  };

  const stopScanning = () => {
    setIsScanning(false);
    setMatchResult(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Face Recognition Scan</h1>
        <p className="text-muted-foreground">
          Scan your face to mark attendance
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Scanner Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanIcon className="h-5 w-5" />
              Scanner
            </CardTitle>
            <CardDescription>
              Position your face in the frame to scan
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
              
              {isScanning && (
                <div className="absolute inset-0">
                  <div className="absolute inset-0 border-4 border-primary rounded-lg animate-pulse" />
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className="w-64 h-64 border-2 border-secondary rounded-full opacity-50" />
                  </div>
                </div>
              )}
              
              {!detectorReady && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">Initializing...</p>
                  </div>
                </div>
              )}
            </div>

            {matchResult && (
              <div className={`p-4 rounded-lg border ${
                matchResult.matched 
                  ? 'bg-success/10 border-success/20' 
                  : 'bg-destructive/10 border-destructive/20'
              }`}>
                <div className="flex items-center gap-3">
                  {matchResult.matched ? (
                    <CheckCircle className="h-6 w-6 text-success" />
                  ) : (
                    <XCircle className="h-6 w-6 text-destructive" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${
                      matchResult.matched ? 'text-success' : 'text-destructive'
                    }`}>
                      {matchResult.matched ? 'Match Found!' : 'No Match'}
                    </p>
                    {matchResult.matched && (
                      <p className="text-sm text-foreground mt-1">
                        Welcome, {matchResult.userName}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground mt-1">
                      Confidence: {(matchResult.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {!isScanning ? (
                <Button 
                  onClick={startScanning} 
                  className="flex-1" 
                  size="lg"
                  disabled={!detectorReady}
                >
                  <ScanIcon className="h-5 w-5 mr-2" />
                  Start Scanning
                </Button>
              ) : (
                <Button 
                  onClick={stopScanning} 
                  variant="destructive"
                  className="flex-1" 
                  size="lg"
                >
                  Stop Scanning
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Status & Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Detector</span>
                <Badge variant={detectorReady ? 'default' : 'secondary'}>
                  {detectorReady ? 'Ready' : 'Loading'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Enrolled Users</span>
                <Badge variant="outline">{allEmbeddings.length}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Threshold</span>
                <Badge variant="outline">{(SIMILARITY_THRESHOLD * 100).toFixed(0)}%</Badge>
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
              <CardTitle>Tips for Best Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 text-sm">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                </div>
                <p className="text-muted-foreground">
                  Ensure good lighting on your face
                </p>
              </div>
              <div className="flex gap-2 text-sm">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                </div>
                <p className="text-muted-foreground">
                  Look directly at the camera
                </p>
              </div>
              <div className="flex gap-2 text-sm">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                </div>
                <p className="text-muted-foreground">
                  Remove glasses if detection fails
                </p>
              </div>
              <div className="flex gap-2 text-sm">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                </div>
                <p className="text-muted-foreground">
                  Stay within the scanning frame
                </p>
              </div>
            </CardContent>
          </Card>

          {matchResult?.matched && (
            <Card className="border-success/20 bg-success/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-success">
                  <User className="h-5 w-5" />
                  Attendance Marked
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Your attendance has been recorded successfully. You can close this page or scan another user.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
