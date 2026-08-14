'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { demoteAdminAction } from '@/app/actions/users';
import { formatDate, type AdminEntry } from '@/lib/types';

export default function AdminsTable({ admins }: { admins: AdminEntry[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function demote(userId: string) {
    setBusy(userId);
    setError(null);
    const result = await demoteAdminAction(userId);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {error ? (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--danger)' }}>
          <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
        </div>
      ) : null}

      {admins.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>No administrators yet.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Promoted</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.user_id}>
                <td>
                  <a href={`/users/${a.user_id}`} style={{ fontWeight: 600 }}>
                    {a.display_name || '—'}
                  </a>
                  <div className="muted" style={{ fontSize: 12 }}>@{a.username}</div>
                </td>
                <td className="muted">{a.email || '—'}</td>
                <td>
                  <span className="badge badge-admin">{a.role}</span>
                </td>
                <td className="muted">{formatDate(a.created_at)}</td>
                <td>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn-danger-sm"
                      disabled={busy === a.user_id}
                      onClick={() => demote(a.user_id)}
                    >
                      {busy === a.user_id ? '…' : 'Demote'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
