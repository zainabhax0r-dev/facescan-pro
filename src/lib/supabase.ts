import { supabase } from "@/integrations/supabase/client";

export type UserRole = 'admin' | 'staff';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface FaceEmbedding {
  id: string;
  user_id: string;
  embedding: number[];
  face_mesh_points: number[][];
  liveness_score: number;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  user_id: string;
  timestamp: string;
  confidence: number;
  screenshot_url?: string;
  device_info?: string;
  location?: string;
  created_at: string;
}

export interface RecognitionLog {
  id: string;
  user_id?: string;
  attempted_embedding: number[];
  similarity_score?: number;
  success: boolean;
  timestamp: string;
  device_info?: string;
}

export { supabase };
