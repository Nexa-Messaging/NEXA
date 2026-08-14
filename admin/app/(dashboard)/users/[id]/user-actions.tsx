'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { banUserAction, restoreUserAction, suspendUserAction } from '@/app/actions/users';
import { promoteAdminAction, demoteAdminAction } from '@/app/actions/users';
import type { UserStatus } from '@/lib/types';

export default function UserActions({
  userId,
  status,
  currentRole,
}: {
  userId: string;
  status: UserStatus;
  currentRole: 'admin' | 'super_admin';
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [suspendUntil, setSuspendUntil] = useState('');
  const [reason, setReason] = useState('');

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

  return (
    <div style={{ maxWidth: 360 }}>
      {error ? (
        <p style={{ color: 'var(--danger)', margin: '0 0 8px', fontSize: 13 }}>{error}</p>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {status === 'active' ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="datetime-local"
                value={suspendUntil}
                onChange={(e) => setSuspendUntil(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="btn-danger-sm"
                disabled={busy !== null || !suspendUntil}
                onClick={() =>
                  run('suspend', () => suspendUserAction(userId, new Date(suspendUntil).toISOString(), reason))
                }
              >
                {busy === 'suspend' ? '…' : 'Suspend'}
              </button>
            </div>
            <button
              className="btn-danger-sm"
              disabled={busy !== null}
              onClick={() => run('ban', () => banUserAction(userId, reason))}
            >
              {busy === 'ban' ? '…' : 'Ban user'}
            </button>
          </>
        ) : (
          <button
            className="btn-sm"
            disabled={busy !== null}
            onClick={() => run('restore', () => restoreUserAction(userId))}
          >
            {busy === 'restore' ? '…' : 'Restore user'}
          </button>
        )}

        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          style={{ width: '100%' }}
        />

        {currentRole === 'super_admin' ? (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Administrator access (super admins only)
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-sm"
                disabled={busy !== null}
                onClick={() => run('promote', () => promoteAdminAction(userId, 'admin'))}
              >
                {busy === 'promote' ? '…' : 'Make admin'}
              </button>
              <button
                className="btn-sm"
                disabled={busy !== null}
                onClick={() => run('promote', () => promoteAdminAction(userId, 'super_admin'))}
              >
                {busy === 'promote' ? '…' : 'Make super admin'}
              </button>
              <button
                className="btn-danger-sm"
                disabled={busy !== null}
                onClick={() => run('demote', () => demoteAdminAction(userId))}
              >
                {busy === 'demote' ? '…' : 'Demote'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
