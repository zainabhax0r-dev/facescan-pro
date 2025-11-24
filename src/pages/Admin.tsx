import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Users, 
  CheckCircle, 
  TrendingUp, 
  Activity,
  Search,
  Download,
  Calendar,
  Shield,
  AlertTriangle
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function Admin() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ 
    totalUsers: 0, 
    totalAttendance: 0, 
    enrolledUsers: 0,
    todayAttendance: 0,
    avgConfidence: 0,
  });
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [chartData, setChartData] = useState<any[]>([]);
  const [recognitionData, setRecognitionData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    fetchAdminData();
  }, [profile]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      // Basic stats
      const { count: usersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      
      const { count: attendanceCount } = await supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true });
      
      const { count: enrolledCount } = await supabase
        .from('face_embeddings')
        .select('*', { count: 'exact', head: true });

      // Today's attendance
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: todayCount } = await supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true })
        .gte('timestamp', today.toISOString());

      // Average confidence
      const { data: confidenceData } = await supabase
        .from('attendance_records')
        .select('confidence');
      
      const avgConf = confidenceData && confidenceData.length > 0
        ? confidenceData.reduce((sum, r) => sum + Number(r.confidence), 0) / confidenceData.length
        : 0;

      setStats({
        totalUsers: usersCount || 0,
        totalAttendance: attendanceCount || 0,
        enrolledUsers: enrolledCount || 0,
        todayAttendance: todayCount || 0,
        avgConfidence: avgConf,
      });

      // Recent attendance
      const { data: recent } = await supabase
        .from('attendance_records')
        .select('*, profiles(full_name, email)')
        .order('timestamp', { ascending: false })
        .limit(15);

      setRecentAttendance(recent || []);

      // Chart data - last 7 days
      await fetchChartData();
      
      // Recognition success data
      await fetchRecognitionData();

    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChartData = async () => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { data } = await supabase
      .from('attendance_records')
      .select('timestamp')
      .gte('timestamp', sevenDaysAgo.toISOString())
      .order('timestamp', { ascending: true });

    // Group by day
    const dayGroups: { [key: string]: number } = {};
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = format(date, 'MMM dd');
      dayGroups[key] = 0;
    }

    data?.forEach(record => {
      const key = format(new Date(record.timestamp), 'MMM dd');
      if (key in dayGroups) {
        dayGroups[key]++;
      }
    });

    const chartData = Object.entries(dayGroups)
      .map(([date, count]) => ({ date, count }))
      .reverse();

    setChartData(chartData);
  };

  const fetchRecognitionData = async () => {
    const { data: logs } = await supabase
      .from('recognition_logs')
      .select('success')
      .limit(100);

    if (logs) {
      const successful = logs.filter(l => l.success).length;
      const failed = logs.length - successful;

      setRecognitionData([
        { name: 'Successful', value: successful, color: '#10b981' },
        { name: 'Failed', value: failed, color: '#ef4444' },
      ]);
    }
  };

  const exportToCSV = () => {
    const csv = [
      ['Name', 'Email', 'Date', 'Time', 'Confidence'],
      ...recentAttendance.map(r => [
        r.profiles?.full_name || 'Unknown',
        r.profiles?.email || '',
        format(new Date(r.timestamp), 'yyyy-MM-dd'),
        format(new Date(r.timestamp), 'HH:mm:ss'),
        `${(Number(r.confidence) * 100).toFixed(1)}%`
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const filteredAttendance = recentAttendance.filter(r => 
    r.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.profiles?.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (profile?.role !== 'admin') {
    return (
      <div className="text-center p-8">
        <Shield className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground text-lg">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 bg-muted rounded-lg" />
        <div className="grid gap-4 md:grid-cols-4">
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            System analytics and attendance management
          </p>
        </div>
        <Button onClick={exportToCSV} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>
      
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.enrolledUsers} enrolled
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-success">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Attendance</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.todayAttendance}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {((stats.todayAttendance / stats.totalUsers) * 100).toFixed(0)}% present
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-accent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalAttendance}</div>
            <p className="text-xs text-muted-foreground mt-1">
              All-time attendance
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-secondary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Confidence</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {(stats.avgConfidence * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Recognition accuracy
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>7-Day Attendance Trend</CardTitle>
            <CardDescription>Daily attendance over the past week</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={3}
                  dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recognition Success Rate</CardTitle>
            <CardDescription>Last 100 recognition attempts</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={recognitionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {recognitionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Attendance Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Attendance</CardTitle>
              <CardDescription>Latest attendance records from all users</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredAttendance.length > 0 ? (
              filteredAttendance.map((record) => (
                <div 
                  key={record.id} 
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-full bg-primary/10">
                      <CheckCircle className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{record.profiles?.full_name || 'Unknown User'}</p>
                      <p className="text-sm text-muted-foreground">{record.profiles?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {format(new Date(record.timestamp), 'MMM dd, yyyy')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(record.timestamp), 'hh:mm:ss a')}
                      </p>
                    </div>
                    <Badge variant="outline" className="font-mono">
                      {(Number(record.confidence) * 100).toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">
                  {searchTerm ? 'No matching records found' : 'No attendance records yet'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
