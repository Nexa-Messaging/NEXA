import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';
import { formatDate, type AdminEntry } from '@/lib/types';
import AdminsTable from './admins-table';

export default async function AdminsPage() {
  const principal = await requireAdmin();
  const supabase = await createAdminClient();

  const { data, error } = await supabase.rpc('admin_list_admins');
  const admins = (data as unknown as AdminEntry[]) ?? [];

  if (principal.ok && principal.role !== 'super_admin') {
    return (
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Admins</h1>
        <p style={{ color: 'var(--danger)' }}>Only super administrators can view or manage admins.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Administrators</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Only super admins can promote or demote administrators. Manage roles from any user&apos;s
        profile page.
      </p>

      {error ? (
        <div className="card">
          <p style={{ color: 'var(--danger)', margin: 0 }}>
            Could not load admins: {error.message}
          </p>
        </div>
      ) : (
        <AdminsTable admins={admins} />
      )}
    </div>
  );
}
