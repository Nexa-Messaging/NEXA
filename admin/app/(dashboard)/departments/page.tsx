import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';
import { formatDate, type Department, type School } from '@/lib/types';
import DepartmentsManager from './departments-manager';

export default async function DepartmentsPage() {
  const principal = await requireAdmin();
  const supabase = await createAdminClient();

  const [{ data: depData, error: depError }, { data: schoolData }] = await Promise.all([
    supabase.rpc('admin_list_departments'),
    supabase.rpc('admin_list_schools'),
  ]);
  const departments = (depData as unknown as Department[]) ?? [];
  const schools = (schoolData as unknown as School[]) ?? [];

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Departments</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Departments within managed schools.
      </p>

      {depError ? (
        <div className="card">
          <p style={{ color: 'var(--danger)', margin: 0 }}>
            Could not load departments: {depError.message}
          </p>
        </div>
      ) : (
        <DepartmentsManager departments={departments} schools={schools} />
      )}
    </div>
  );
}
