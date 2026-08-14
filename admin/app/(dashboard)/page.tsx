import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';
import type { AnalyticsMetric } from '@/lib/types';

const METRIC_LABELS: Record<string, string> = {
  total_users: 'Total users',
  active_users: 'Active users (30d)',
  new_users_30d: 'New users (30d)',
  new_users_7d: 'New users (7d)',
  messages: 'Messages',
  stories: 'Stories',
  communities: 'Communities',
  reports: 'Reports (all)',
  open_reports: 'Open reports',
};

export default async function OverviewPage() {
  const principal = await requireAdmin();
  const supabase = await createAdminClient();

  const { data, error } = await supabase.rpc('admin_analytics');
  const metrics = ((data as unknown as AnalyticsMetric[]) ?? []).filter(
    (m) => METRIC_LABELS[m.metric],
  );

  if (error || !principal.ok) {
    return (
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Overview</h1>
        <p className="muted">
          {error ? `Could not load analytics: ${error.message}` : 'Not authorized.'}
        </p>
      </div>
    );
  }

  const metricCards = metrics.map((m) => (
    <div key={m.metric} className="card" style={{ flex: '1 1 220px' }}>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{m.value.toLocaleString()}</div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        {METRIC_LABELS[m.metric]}
      </div>
    </div>
  ));

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Overview</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Platform health and activity at a glance.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8 }}>
        {metricCards}
      </div>
    </div>
  );
}
