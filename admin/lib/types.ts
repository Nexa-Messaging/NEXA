export type UserStatus = 'active' | 'suspended' | 'banned';

export interface AdminUser {
  id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  school: string | null;
  department: string | null;
  level: string | null;
  banned_at: string | null;
  suspended_until: string | null;
  ban_reason: string | null;
  created_at: string | null;
  is_admin: boolean | null;
  admin_role: string | null;
}

export interface UserDetail extends AdminUser {
  bio: string | null;
  messages_sent: number | null;
  stories_posted: number | null;
  communities_joined: number | null;
  reports_filed: number | null;
  reports_against: number | null;
}

export interface Report {
  id: string;
  target_type: string;
  target_id: string;
  category: string;
  details: string | null;
  content: string | null;
  status: string;
  reporter_id: string | null;
  reporter_name: string | null;
  reporter_username: string | null;
  created_at: string | null;
}

export interface School {
  id: string;
  name: string;
  created_at: string | null;
  departments_count: number | null;
}

export interface Department {
  id: string;
  school_id: string;
  school_name: string | null;
  name: string;
  created_at: string | null;
}

export interface Community {
  id: string;
  name: string;
  description: string | null;
  school: string | null;
  department: string | null;
  level: string | null;
  created_at: string | null;
  members_count: number | null;
  messages_count: number | null;
  owner_name: string | null;
  owner_username: string | null;
}

export interface AnalyticsMetric {
  metric: string;
  value: number;
}

export interface AdminEntry {
  user_id: string;
  role: string;
  created_at: string | null;
  display_name: string | null;
  username: string | null;
  email: string | null;
}

export function userStatus(u: Pick<AdminUser, 'banned_at' | 'suspended_until'>): UserStatus {
  if (u.banned_at) return 'banned';
  if (u.suspended_until && new Date(u.suspended_until) > new Date()) return 'suspended';
  return 'active';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (Number.isNaN(diff)) return '—';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
