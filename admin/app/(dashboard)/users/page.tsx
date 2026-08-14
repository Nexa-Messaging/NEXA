import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';
import { formatDate, userStatus, type AdminUser } from '@/lib/types';
import UsersTable from './users-table';

const PAGE_SIZE = 50;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const principal = await requireAdmin();
  const supabase = await createAdminClient();
  const params = await searchParams;

  const q = params.q ?? '';
  const status = params.status ?? '';
  const page = Math.max(0, parseInt(params.page ?? '0', 10) || 0);

  const { data, error } = await supabase.rpc('admin_list_users', {
    p_search: q || null,
    p_status: status || null,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  });
  const users = (data as unknown as AdminUser[]) ?? [];

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Users</h1>

      <form
        method="GET"
        style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, username or email…"
          style={{ minWidth: 260, flex: 1 }}
        />
        <select name="status" defaultValue={status} style={{ minWidth: 150 }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
        <button className="btn btn-primary" type="submit">
          Search
        </button>
      </form>

      {error ? (
        <div className="card">
          <p style={{ color: 'var(--danger)', margin: 0 }}>
            Could not load users: {error.message}
          </p>
        </div>
      ) : (
        <>
          <UsersTable users={users} currentUserId={principal.ok ? principal.userId : undefined} />

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <a className="btn" href={`/users?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&page=${Math.max(0, page - 1)}`}>
              ← Prev
            </a>
            <a
              className="btn"
              href={`/users?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&page=${page + 1}`}
            >
              Next →
            </a>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Showing {users.length} of up to {PAGE_SIZE} per page.
          </p>
        </>
      )}
    </div>
  );
}
