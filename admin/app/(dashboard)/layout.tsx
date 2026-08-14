import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { logoutAction } from '@/app/actions/auth';
import LogoutButton from './logout-button';

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const principal = await requireAdmin();

  if (!principal.ok) {
    if (principal.reason === 'no_session') {
      redirect('/login');
    }
    redirect('/login?reason=not_admin');
  }

  const isSuper = principal.role === 'super_admin';

  const navItems = [
    { href: '/', label: 'Overview', exact: true },
    { href: '/users', label: 'Users', exact: false },
    { href: '/reports', label: 'Reports', exact: false },
    { href: '/schools', label: 'Schools', exact: false },
    { href: '/departments', label: 'Departments', exact: false },
    { href: '/communities', label: 'Communities', exact: false },
  ];
  if (isSuper) {
    navItems.push({ href: '/admins', label: 'Admins', exact: false });
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 12px',
        }}
      >
        <div style={{ padding: '8px 12px 16px' }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>NEXA Admin</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {principal.role === 'super_admin' ? 'Super administrator' : 'Administrator'}
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: '9px 12px',
                borderRadius: 8,
                color: 'var(--text)',
                fontWeight: 600,
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div style={{ padding: '12px 12px 0', borderTop: '1px solid var(--border)', marginTop: 12 }}>
          <LogoutButton />
        </div>
      </aside>

      <main style={{ flex: 1, padding: '28px 32px', minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
