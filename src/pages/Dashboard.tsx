import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { 
  Scan, 
  UserPlus, 
  CheckCircle, 
  Users,
  TrendingUp,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';

export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    totalAttendance: 0,
    todayAttendance: 0,
    faceEnrolled: false,
    lastAttendance: null as string | null,
  });
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [profile]);

  const fetchDashboardData = async () => {
    if (!profile) return;

    try {
      // Check if face is enrolled
      const { data: embedding } = await supabase
        .from('face_embeddings')
        .select('id')
        .eq('user_id', profile.id)
        .maybeSingle();

      // Get total attendance count
      const { count: totalCount } = await supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id);

      // Get today's attendance
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: todayCount } = await supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .gte('timestamp', today.toISOString());

      // Get recent attendance
      const { data: recent } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('user_id', profile.id)
        .order('timestamp', { ascending: false })
        .limit(5);

      // Get last attendance
      const { data: last } = await supabase
        .from('attendance_records')
        .select('timestamp')
        .eq('user_id', profile.id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      setStats({
        totalAttendance: totalCount || 0,
        todayAttendance: todayCount || 0,
        faceEnrolled: !!embedding,
        lastAttendance: last?.timestamp || null,
      });

      setRecentAttendance(recent || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-40 bg-muted rounded-lg animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="bg-gradient-primary rounded-lg p-8 text-white shadow-glow animate-slide-up relative overflow-hidden">
        <div className="absolute inset-0 bg-white/5 backdrop-blur-3xl" />
        <div className="relative z-10">
          <h2 className="text-3xl font-bold mb-2 animate-fade-in">
            Welcome back, {profile?.full_name}!
          </h2>
          <p className="text-white/90 mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            {stats.faceEnrolled 
              ? 'Your face is enrolled. You can now mark attendance by scanning.' 
              : 'Get started by enrolling your face to use the attendance system.'}
          </p>
          <div className="flex flex-wrap gap-3 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            {!stats.faceEnrolled && (
              <Button asChild variant="secondary" size="lg" className="hover:scale-105 transition-transform">
                <Link to="/enroll">
                  <UserPlus className="h-5 w-5 mr-2" />
                  Enroll Face
                </Link>
              </Button>
            )}
            <Button asChild variant="secondary" size="lg" className="hover:scale-105 transition-transform">
              <Link to="/scan">
                <Scan className="h-5 w-5 mr-2" />
                Scan Now
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-lg transition-all duration-300 animate-scale-in border-l-4 border-l-success">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Face Status</CardTitle>
            <div className={stats.faceEnrolled ? "animate-pulse" : ""}>
              <CheckCircle className={stats.faceEnrolled ? "h-5 w-5 text-success" : "h-5 w-5 text-muted-foreground"} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.faceEnrolled ? 'Enrolled' : 'Not Enrolled'}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.faceEnrolled ? 'Ready to scan' : 'Enroll to get started'}
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all duration-300 animate-scale-in border-l-4 border-l-primary" style={{ animationDelay: '0.1s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Attendance</CardTitle>
            <Clock className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todayAttendance}</div>
            <p className="text-xs text-muted-foreground">
              {stats.todayAttendance > 0 ? 'Marked today' : 'Not marked yet'}
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all duration-300 animate-scale-in border-l-4 border-l-accent" style={{ animationDelay: '0.2s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <TrendingUp className="h-5 w-5 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAttendance}</div>
            <p className="text-xs text-muted-foreground">
              All-time attendance
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all duration-300 animate-scale-in border-l-4 border-l-secondary" style={{ animationDelay: '0.3s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Scan</CardTitle>
            <Users className="h-5 w-5 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.lastAttendance 
                ? format(new Date(stats.lastAttendance), 'HH:mm')
                : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.lastAttendance 
                ? format(new Date(stats.lastAttendance), 'MMM dd, yyyy')
                : 'No records yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Attendance */}
      {recentAttendance.length > 0 && (
        <Card className="animate-slide-up">
          <CardHeader>
            <CardTitle>Recent Attendance</CardTitle>
            <CardDescription>Your latest attendance records</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentAttendance.map((record, index) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-all duration-300 hover:scale-[1.02] animate-fade-in border border-transparent hover:border-primary/20"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-full bg-primary/10 relative">
                      <CheckCircle className="h-5 w-5 text-primary" />
                      <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {format(new Date(record.timestamp), 'MMMM dd, yyyy')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(record.timestamp), 'hh:mm a')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                      <p className="text-sm font-medium">
                        {(record.confidence * 100).toFixed(1)}%
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Confidence
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
