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
import { Skeleton } from '@/components/ui/Skeleton';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const user = useUser();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role === 'USER') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  // Skeleton shell instead of a spinner (2026-08-20 app-wide requirement)
  // while the auth/role gate resolves — mirrors AdminSidebar + AdminTopBar's
  // real dimensions so there's no layout jump once `user` lands.
  if (!user || user.role === 'USER') {
    return (
      <div className="flex bg-background min-h-screen">
        <div className="w-72 bg-surface border-r border-border flex flex-col shrink-0 min-h-screen p-6 gap-8">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex flex-col flex-1 min-w-0 p-6 gap-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-32 w-full" />
        </div>
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
