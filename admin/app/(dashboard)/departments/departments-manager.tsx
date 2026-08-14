'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  createDepartmentAction,
  deleteDepartmentAction,
  renameDepartmentAction,
} from '@/app/actions/directory';
import { formatDate, type Department, type School } from '@/lib/types';

export default function DepartmentsManager({
  departments,
  schools,
}: {
  departments: Department[];
  schools: School[];
}) {
  const router = useRouter();
  const [newSchool, setNewSchool] = useState('');
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
        <h3 style={{ marginTop: 0 }}>Add department</h3>
        <form
          style={{ display: 'flex', gap: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (newSchool && newName.trim()) {
              run('create', () => createDepartmentAction(newSchool, newName.trim()));
            }
          }}
        >
          <select
            value={newSchool}
            onChange={(e) => setNewSchool(e.target.value)}
            style={{ flex: 1 }}
            required
          >
            <option value="">Select school…</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Department name"
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" type="submit" disabled={busy !== null || schools.length === 0}>
            {busy === 'create' ? '…' : 'Add'}
          </button>
        </form>
      </div>

      {departments.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>No departments yet.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>School</th>
              <th>Created</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id}>
                <td>
                  {editing === d.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <span style={{ fontWeight: 600 }}>{d.name}</span>
                  )}
                </td>
                <td className="muted">{d.school_name || '—'}</td>
                <td className="muted">{formatDate(d.created_at)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {editing === d.id ? (
                      <>
                        <button
                          className="btn-sm"
                          disabled={busy !== null}
                          onClick={() => run('rename', () => renameDepartmentAction(d.id, editName))}
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
                            setEditing(d.id);
                            setEditName(d.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="btn-danger-sm"
                          disabled={busy !== null}
                          onClick={() => run('delete', () => deleteDepartmentAction(d.id))}
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
