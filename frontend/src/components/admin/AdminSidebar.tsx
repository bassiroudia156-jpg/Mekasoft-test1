'use client';

// Admin back-office sidebar (2026-08-20) — pixel-parity source: Banani flow
// "Tableau Atelier", shared component `/components/AdminSidebar.jsx`
// (screen "Admin Dashboard — Vue d'ensemble"). Structure (logo block → nav
// list → divider → nav list → divider → logout) is 1:1 with the fetched
// design; colors/radii are mapped onto this project's own globals.css
// tokens rather than Banani's own orange/light-gray theme snapshot — see
// .planning/banani/admin-dashboard.md "Token mapping" for the reasoning
// (project tokens win on conflict, per the banani-design-implementation
// skill + this app's own precedent of correcting Banani placeholder colors
// to the real brand palette).
//
// Analytics/Intégrations/Support/Feedback are real pages here (2026-08-20
// follow-up ask), not the stub placeholders originally proposed — every
// link below resolves to a working route. "Journal d'activité" was added
// on top of Banani's own nav list (not in the original design) because the
// backend audit-log route already existed and fully supports it.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import BrandLogo from '@/components/ui/BrandLogo';
import { useAuth } from '@/contexts/AuthContext';
import LogoutConfirmModal from '@/components/auth/LogoutConfirmModal';

interface NavItem {
  href: string;
  icon: string;
  label: string;
  /** SUPERADMIN-only destinations are still shown to ADMIN (so the menu is
   * legible/consistent) but the page itself enforces the real gate — this
   * flag just adds a small lock hint. */
  superadminOnly?: boolean;
}

const MAIN_NAV: NavItem[] = [
  { href: '/admin', icon: 'layout-dashboard', label: 'Dashboard' },
  { href: '/admin/analytics', icon: 'activity', label: 'Analytics' },
  { href: '/admin/users', icon: 'users-round', label: 'Utilisateurs' },
  { href: '/admin/garages', icon: 'building-2', label: 'Garages' },
];

const MANAGEMENT_NAV: NavItem[] = [
  { href: '/admin/pricing', icon: 'store', label: 'Tarification', superadminOnly: true },
  { href: '/admin/promotions', icon: 'percent', label: 'Promotions', superadminOnly: true },
  { href: '/admin/integrations', icon: 'link', label: 'Intégrations', superadminOnly: true },
  { href: '/admin/support', icon: 'message-circle', label: 'Support' },
];

const GENERAL_NAV: NavItem[] = [
  { href: '/admin/feedback', icon: 'message-square', label: 'Feedback' },
  { href: '/admin/audit-log', icon: 'scroll-text', label: "Journal d'activité" },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${
        active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-secondary'
      }`}
    >
      <Icon i={item.icon} size={16} />
      <span className="flex-1 text-left">{item.label}</span>
      {item.superadminOnly && (
        <Icon
          i="lock"
          size={12}
          className={active ? 'text-primary-foreground/60' : 'text-muted-foreground'}
        />
      )}
    </Link>
  );
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function confirmLogout() {
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
    setLogoutOpen(false);
    router.push('/login?logged_out=1');
  }

  return (
    <>
      <div className="w-72 bg-surface border-r border-border flex flex-col shrink-0 min-h-screen">
        <div className="px-6 py-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Icon i="shield" size={20} className="text-primary-foreground" />
            </div>
            <div>
              <BrandLogo variant="light" className="h-5 w-auto mb-0.5" />
              <div className="text-xs text-muted-foreground">Back-office</div>
            </div>
          </div>
        </div>

        <div className="px-6 pt-6 pb-3">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Menu
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-4">
          {MAIN_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} />
          ))}
        </nav>

        <div className="my-4 border-t border-border" />
        <div className="px-6 pb-3">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Gestion
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-4">
          {MANAGEMENT_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} />
          ))}
        </nav>

        <div className="my-4 border-t border-border" />
        <div className="px-6 pb-3">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Général
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-4 flex-1">
          {GENERAL_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} />
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-border flex flex-col gap-1">
          <Link
            href="/dashboard"
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-secondary transition"
          >
            <Icon i="arrow-left" size={16} />
            Retour à l&apos;application
          </Link>
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-accent hover:bg-accent/10 transition text-left"
          >
            <Icon i="log-out" size={16} />
            Déconnexion
          </button>
        </div>
      </div>

      {user && (
        <LogoutConfirmModal
          open={logoutOpen}
          onCancel={() => setLogoutOpen(false)}
          onConfirm={() => void confirmLogout()}
          userEmail={user.email}
          userLabel={user.name ?? user.email}
          confirming={loggingOut}
        />
      )}
    </>
  );
}
