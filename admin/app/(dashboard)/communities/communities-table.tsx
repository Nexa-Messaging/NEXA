'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { removeCommunityAction } from '@/app/actions/communities';
import { formatDate, type Community } from '@/lib/types';

export default function CommunitiesTable({ communities }: { communities: Community[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(label: string, action: () => Promise<{ error?: string }>) {
    setBusy(label);
    setError(null);
    const result = await action();
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (communities.length === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>No communities found.</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {error ? (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--danger)' }}>
          <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>School · Department</th>
            <th>Owner</th>
            <th>Members</th>
            <th>Messages</th>
            <th>Created</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {communities.map((c) => (
            <tr key={c.id}>
              <td style={{ fontWeight: 600 }}>{c.name}</td>
              <td className="muted">
                {[c.school, c.department, c.level].filter(Boolean).join(' · ') || '—'}
              </td>
              <td className="muted">
                {c.owner_name ? `${c.owner_name} (@${c.owner_username})` : '—'}
              </td>
              <td>{c.members_count ?? 0}</td>
              <td>{c.messages_count ?? 0}</td>
              <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                {formatDate(c.created_at)}
              </td>
              <td>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn-danger-sm"
                    disabled={busy === `remove:${c.id}`}
                    onClick={() => run(`remove:${c.id}`, () => removeCommunityAction(c.id))}
                  >
                    {busy === `remove:${c.id}` ? '…' : 'Remove community'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
