import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';
import { formatDate, type Community } from '@/lib/types';
import CommunitiesTable from './communities-table';

const PAGE_SIZE = 50;

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const principal = await requireAdmin();
  const supabase = await createAdminClient();
  const params = await searchParams;

  const q = params.q ?? '';
  const page = Math.max(0, parseInt(params.page ?? '0', 10) || 0);

  const { data, error } = await supabase.rpc('admin_list_communities', {
    p_search: q || null,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  });
  const communities = (data as unknown as Community[]) ?? [];

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Communities</h1>

      <form method="GET" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, school or department…"
          style={{ minWidth: 260, flex: 1 }}
        />
        <button className="btn btn-primary" type="submit">
          Search
        </button>
      </form>

      {error ? (
        <div className="card">
          <p style={{ color: 'var(--danger)', margin: 0 }}>
            Could not load communities: {error.message}
          </p>
        </div>
      ) : (
        <CommunitiesTable communities={communities} />
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <a className="btn" href={`/communities?q=${encodeURIComponent(q)}&page=${Math.max(0, page - 1)}`}>
          ← Prev
        </a>
        <a className="btn" href={`/communities?q=${encodeURIComponent(q)}&page=${page + 1}`}>
          Next →
        </a>
      </div>
    </div>
  );
}
