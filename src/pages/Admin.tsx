import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, CheckCircle, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

export default function Admin() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ totalUsers: 0, totalAttendance: 0, enrolledUsers: 0 });
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    fetchAdminData();
  }, [profile]);

  const fetchAdminData = async () => {
    const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { count: attendanceCount } = await supabase.from('attendance_records').select('*', { count: 'exact', head: true });
    const { count: enrolledCount } = await supabase.from('face_embeddings').select('*', { count: 'exact', head: true });
    const { data: recent } = await supabase.from('attendance_records').select('*, profiles(full_name)').order('timestamp', { ascending: false }).limit(10);

    setStats({ totalUsers: usersCount || 0, totalAttendance: attendanceCount || 0, enrolledUsers: enrolledCount || 0 });
    setRecentAttendance(recent || []);
  };

  if (profile?.role !== 'admin') {
    return <div className="text-center p-8"><p className="text-muted-foreground">Access denied. Admin only.</p></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.totalUsers}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enrolled</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.enrolledUsers}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.totalAttendance}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Attendance</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentAttendance.map((record) => (
              <div key={record.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium">{record.profiles?.full_name}</p>
                  <p className="text-sm text-muted-foreground">{format(new Date(record.timestamp), 'PPp')}</p>
                </div>
                <Badge>{(record.confidence * 100).toFixed(1)}%</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
