'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  banUserAction,
  restoreUserAction,
  suspendUserAction,
} from '@/app/actions/users';
import { userStatus, type AdminUser } from '@/lib/types';
import { formatDate } from '@/lib/types';

export default function UsersTable({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId?: string;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: () => Promise<{ error?: string }>, id: string) {
    setPendingId(id);
    setError(null);
    const result = await action();
    setPendingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {error ? (
        <div
          className="card"
          style={{ marginBottom: 16, borderColor: 'var(--danger)' }}
        >
          <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
        </div>
      ) : null}

      {users.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>No users found.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>School</th>
              <th>Status</th>
              <th>Joined</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const status = userStatus(u);
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id}>
                  <td>
                    <a href={`/users/${u.id}`} style={{ fontWeight: 600 }}>
                      {u.display_name || '—'}
                    </a>
                    <div className="muted" style={{ fontSize: 12 }}>
                      @{u.username || '—'}
                      {u.is_admin ? (
                        <span className="badge badge-admin" style={{ marginLeft: 6 }}>
                          {u.admin_role}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="muted">{u.email || '—'}</td>
                  <td className="muted">
                    {u.school ? `${u.school}${u.department ? ' · ' + u.department : ''}` : '—'}
                  </td>
                  <td>
                    <span className={`badge badge-${status}`}>{status}</span>
                  </td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {formatDate(u.created_at)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      {!isSelf && status === 'active' && (
                        <>
                          <button
                            className="btn-danger-sm"
                            disabled={pendingId === u.id}
                            onClick={() =>
                              runAction(() => suspendUserAction(u.id, new Date(Date.now() + 7 * 864e5).toISOString()), u.id)
                            }
                          >
                            Suspend 7d
                          </button>
                          <button
                            className="btn-danger-sm"
                            disabled={pendingId === u.id}
                            onClick={() => runAction(() => banUserAction(u.id), u.id)}
                          >
                            Ban
                          </button>
                        </>
                      )}
                      {(status === 'banned' || status === 'suspended') && (
                        <button
                          className="btn-sm"
                          disabled={pendingId === u.id}
                          onClick={() => runAction(() => restoreUserAction(u.id), u.id)}
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
