import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';
import { formatDate, userStatus, type UserDetail } from '@/lib/types';
import UserActions from './user-actions';

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const principal = await requireAdmin();
  const { id } = await params;
  const supabase = await createAdminClient();

  const { data, error } = await supabase.rpc('admin_user_detail', { p_user: id });
  const user = (data as unknown as UserDetail[])?.[0];

  if (!user) {
    if (error?.message === 'User not found') {
      notFound();
    }
    return (
      <div className="card">
        <h1 style={{ marginTop: 0 }}>User</h1>
        <p style={{ color: 'var(--danger)' }}>{error?.message ?? 'User not found'}</p>
      </div>
    );
  }

  const status = userStatus(user);
  const isSelf = principal.ok && principal.userId === user.id;

  return (
    <div>
      <a className="btn btn-sm" href="/users" style={{ marginBottom: 16 }}>
        ← Back to users
      </a>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0 }}>{user.display_name || 'No name'}</h1>
              <span className={`badge badge-${status}`}>{status}</span>
              {user.is_admin ? (
                <span className="badge badge-admin">{user.admin_role}</span>
              ) : null}
            </div>
            <p className="muted" style={{ marginTop: 4 }}>
              @{user.username || '—'} · {user.email || '—'}
            </p>
            {user.ban_reason ? (
              <p style={{ color: 'var(--warning)', margin: '8px 0 0' }}>
                Reason: {user.ban_reason}
              </p>
            ) : null}
            {user.suspended_until ? (
              <p style={{ color: 'var(--warning)', margin: '8px 0 0' }}>
                Suspended until {formatDate(user.suspended_until)}
              </p>
            ) : null}
          </div>

          {!isSelf ? (
            <UserActions
              userId={user.id}
              status={status}
              currentRole={principal.ok ? principal.role : 'admin'}
            />
          ) : (
            <p className="muted">This is your own account.</p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <div className="card" style={{ flex: '1 1 280px' }}>
          <h3 style={{ marginTop: 0 }}>Profile</h3>
          <table>
            <tbody>
              <tr>
                <td className="muted">School</td>
                <td>{user.school || '—'}</td>
              </tr>
              <tr>
                <td className="muted">Department</td>
                <td>{user.department || '—'}</td>
              </tr>
              <tr>
                <td className="muted">Level</td>
                <td>{user.level || '—'}</td>
              </tr>
              <tr>
                <td className="muted">Joined</td>
                <td>{formatDate(user.created_at)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card" style={{ flex: '1 1 280px' }}>
          <h3 style={{ marginTop: 0 }}>Activity</h3>
          <table>
            <tbody>
              <tr>
                <td className="muted">Messages sent</td>
                <td>{user.messages_sent?.toLocaleString() ?? '—'}</td>
              </tr>
              <tr>
                <td className="muted">Stories posted</td>
                <td>{user.stories_posted?.toLocaleString() ?? '—'}</td>
              </tr>
              <tr>
                <td className="muted">Communities joined</td>
                <td>{user.communities_joined?.toLocaleString() ?? '—'}</td>
              </tr>
              <tr>
                <td className="muted">Reports filed</td>
                <td>{user.reports_filed?.toLocaleString() ?? '—'}</td>
              </tr>
              <tr>
                <td className="muted">Reports against</td>
                <td>{user.reports_against?.toLocaleString() ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
