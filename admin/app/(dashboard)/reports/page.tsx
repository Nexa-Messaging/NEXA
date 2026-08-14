import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';
import { formatDate, type Report } from '@/lib/types';
import ReportsTable from './reports-table';

const PAGE_SIZE = 50;

const TARGET_LABELS: Record<string, string> = {
  user: 'User',
  message: 'DM message',
  group_message: 'Group message',
  community_message: 'Community message',
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const principal = await requireAdmin();
  const supabase = await createAdminClient();
  const params = await searchParams;

  const status = params.status ?? '';
  const page = Math.max(0, parseInt(params.page ?? '0', 10) || 0);

  const { data, error } = await supabase.rpc('admin_list_reports', {
    p_status: status || null,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  });
  const reports = (data as unknown as Report[]) ?? [];

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Reports</h1>

      <form method="GET" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <select name="status" defaultValue={status} style={{ minWidth: 170 }}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="reviewing">Reviewing</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <button className="btn btn-primary" type="submit">
          Filter
        </button>
      </form>

      {error ? (
        <div className="card">
          <p style={{ color: 'var(--danger)', margin: 0 }}>
            Could not load reports: {error.message}
          </p>
        </div>
      ) : (
        <ReportsTable reports={reports} />
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <a className="btn" href={`/reports?status=${encodeURIComponent(status)}&page=${Math.max(0, page - 1)}`}>
          ← Prev
        </a>
        <a className="btn" href={`/reports?status=${encodeURIComponent(status)}&page=${page + 1}`}>
          Next →
        </a>
      </div>
    </div>
  );
}
