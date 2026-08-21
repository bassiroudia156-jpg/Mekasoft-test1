'use client';

// Shell for every /admin/* page (2026-08-20) — sidebar + auth/role guard in
// one place so individual pages only render their own AdminTopBar + content.
//
// Guard shape: `useUser()` already redirects to /login when there's no
// session (existing app-wide convention, see AuthContext.tsx). On top of
// that, a USER-role session is bounced to /dashboard — the back-office
// itself never renders for them. This is a UX convenience only: every
// /api/admin/* route re-checks the role server-side regardless (CLAUDE.md
// invariant), so a client that lies about its role gains nothing.
import { type ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import AdminSidebar from '@/components/admin/AdminSidebar';
import Icon from '@/components/ui/Icon';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const user = useUser();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role === 'USER') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  if (!user || user.role === 'USER') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Icon i="loader-circle" size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex bg-background min-h-screen">
      <AdminSidebar />
      <div className="flex flex-col flex-1 min-w-0">{children}</div>
    </div>
  );
}
