'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  createSchoolAction,
  deleteSchoolAction,
  renameSchoolAction,
} from '@/app/actions/directory';
import { formatDate, type School } from '@/lib/types';

export default function SchoolsManager({ schools }: { schools: School[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
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
    setNewName('');
    setEditing(null);
    router.refresh();
  }

  return (
    <div>
      {error ? (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--danger)' }}>
          <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Add school</h3>
        <form
          style={{ display: 'flex', gap: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) run('create', () => createSchoolAction(newName.trim()));
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="School name"
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" type="submit" disabled={busy !== null}>
            {busy === 'create' ? '…' : 'Add'}
          </button>
        </form>
      </div>

      {schools.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>No schools yet.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Departments</th>
              <th>Created</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schools.map((s) => (
              <tr key={s.id}>
                <td>
                  {editing === s.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                  )}
                </td>
                <td className="muted">{s.departments_count ?? 0}</td>
                <td className="muted">{formatDate(s.created_at)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {editing === s.id ? (
                      <>
                        <button
                          className="btn-sm"
                          disabled={busy !== null}
                          onClick={() => run('rename', () => renameSchoolAction(s.id, editName))}
                        >
                          Save
                        </button>
                        <button className="btn-sm" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn-sm"
                          onClick={() => {
                            setEditing(s.id);
                            setEditName(s.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="btn-danger-sm"
                          disabled={busy !== null}
                          onClick={() => run('delete', () => deleteSchoolAction(s.id))}
                        >
                          Delete
                        </button>
                      </>
                    )}
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
