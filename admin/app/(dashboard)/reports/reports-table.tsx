'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { removeReportedContentAction, setReportStatusAction } from '@/app/actions/reports';
import { formatDate, type Report } from '@/lib/types';

const TARGET_LABELS: Record<string, string> = {
  user: 'User',
  message: 'DM message',
  group_message: 'Group message',
  community_message: 'Community message',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'var(--warning)',
  reviewing: 'var(--primary)',
  resolved: 'var(--success)',
  dismissed: 'var(--text-muted)',
};

export default function ReportsTable({ reports }: { reports: Report[] }) {
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

  if (reports.length === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>No reports found.</p>
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
            <th>Target</th>
            <th>Category</th>
            <th>Content</th>
            <th>Reporter</th>
            <th>Status</th>
            <th>Created</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id}>
              <td>
                <span className="badge" style={{ background: 'var(--surface-2)' }}>
                  {TARGET_LABELS[r.target_type] ?? r.target_type}
                </span>
                <div className="muted" style={{ fontSize: 11, marginTop: 4, fontFamily: 'monospace' }}>
                  {r.target_id}
                </div>
              </td>
              <td>{r.category}</td>
              <td style={{ maxWidth: 320 }}>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {r.content || r.details || '—'}
                </div>
              </td>
              <td className="muted">
                {r.reporter_name ? (
                  <>
                    {r.reporter_name}
                    <div style={{ fontSize: 12 }}>@{r.reporter_username}</div>
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td>
                <span style={{ color: STATUS_COLORS[r.status] ?? 'var(--text)' }} className="badge">
                  {r.status}
                </span>
              </td>
              <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                {formatDate(r.created_at)}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <select
                    defaultValue={r.status}
                    style={{ padding: '5px 8px', fontSize: 13 }}
                    onChange={(e) =>
                      run(`status:${r.id}`, () => setReportStatusAction(r.id, e.target.value))
                    }
                  >
                    <option value="open">open</option>
                    <option value="reviewing">reviewing</option>
                    <option value="resolved">resolved</option>
                    <option value="dismissed">dismissed</option>
                  </select>
                  {r.target_type !== 'user' && (
                    <button
                      className="btn-danger-sm"
                      disabled={busy === `remove:${r.id}`}
                      onClick={() =>
                        run(`remove:${r.id}`, () => removeReportedContentAction(r.id))
                      }
                    >
                      {busy === `remove:${r.id}` ? '…' : 'Remove content'}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
