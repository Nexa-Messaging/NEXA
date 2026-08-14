'use client';

import { useTransition } from 'react';
import { logoutAction } from '@/app/actions/auth';

export default function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="btn"
      style={{ width: '100%', justifyContent: 'center' }}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await logoutAction();
          window.location.href = '/login';
        });
      }}
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
