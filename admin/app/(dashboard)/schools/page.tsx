import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';
import { formatDate, type School } from '@/lib/types';
import SchoolsManager from './schools-manager';

export default async function SchoolsPage() {
  const principal = await requireAdmin();
  const supabase = await createAdminClient();

  const { data, error } = await supabase.rpc('admin_list_schools');
  const schools = (data as unknown as School[]) ?? [];

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Schools</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Managed directory of schools shown in the admin dashboard.
      </p>

      {error ? (
        <div className="card">
          <p style={{ color: 'var(--danger)', margin: 0 }}>
            Could not load schools: {error.message}
          </p>
        </div>
      ) : (
        <SchoolsManager schools={schools} />
      )}
    </div>
  );
}
