'use client';

import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import BrandLogo from '@/components/ui/BrandLogo';
import UserAvatar from '@/components/ui/UserAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileSidebar } from '@/contexts/MobileSidebarContext';
import { orgRoleLabel } from '@/lib/roleLabel';

export type SidebarActiveKey =
  | 'dashboard'
  | 'interventions'
  | 'clients'
  | 'vehicles'
  | 'invoices'
  | 'payments'
  | 'settings'
  // Not a NAV_ITEMS entry (the account block below isn't part of that list)
  // — exists purely so /profile can pass an honest value instead of lying
  // with 'settings', which would wrongly highlight "Paramètres".
  | 'profile';

// Every item now has a real route. This was a plain `<a href="#">` through
// Phases 1–5 (the sidebar never actually navigated), fixed while wiring
// /invoices in Phase 6; "Paiements" was the last `href: null` holdout,
// filled in Phase 7. "Paramètres" added in Phase 8.
const NAV_ITEMS: { id: SidebarActiveKey; icon: string; label: string; href: string }[] = [
  { id: 'dashboard', icon: 'layout-dashboard', label: 'Tableau de bord', href: '/dashboard' },
  { id: 'interventions', icon: 'wrench', label: 'Interventions', href: '/interventions' },
  { id: 'clients', icon: 'users', label: 'Clients', href: '/clients' },
  { id: 'vehicles', icon: 'car', label: 'Véhicules', href: '/vehicles' },
  { id: 'invoices', icon: 'file-text', label: 'Factures', href: '/invoices' },
  { id: 'payments', icon: 'banknote', label: 'Paiements', href: '/payments' },
  { id: 'settings', icon: 'settings', label: 'Paramètres', href: '/settings' },
];

export interface SidebarProps {
  active: SidebarActiveKey;
}

// Phase 8: the bottom account block used to hardcode 'Mon compte'/'Gérant'
// defaults nothing overrode across all 16 call sites — identical bug to
// ManagerProfilePanel's placeholder identity, fixed the same way (self-
// derive from useAuth() instead of props nothing supplies).
//
// Responsive audit fix (2026-08-17): this was a fixed w-56 column with no
// mobile behavior at all — on any of the 18 authenticated pages that render
// it, a <1024px viewport had ~150px left for the entire rest of the page.
// Below `lg:` it's now an off-canvas panel (same visual language as
// SlideOver: bg-foreground/30 backdrop, z-40/z-50, transition-transform) —
// hidden by default, opened via the hamburger button rendered inside
// TopBar/PageHeader (see MobileSidebarContext for why the toggle lives in a
// context rather than a prop passed down from each page). At `lg:` and up
// it reverts to the original always-visible static column, unchanged.
export default function Sidebar({ active }: SidebarProps) {
  const { user } = useAuth();
  const { open, close } = useMobileSidebar();
  const displayName = user?.name ?? user?.email ?? 'Mon compte';
  const displayRole = user ? orgRoleLabel(user.orgRole, user.jobTitle) : '';

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-foreground/30 z-40 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 lg:static lg:z-auto bg-primary flex flex-col w-56 min-h-screen shrink-0 transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo — dark variant because its SVG card background (#152A4E)
            matches --color-primary exactly, so it sits flush on this rail
            with no visible box edge (see AuthBrandPanel for the same
            reasoning; was a hand-built BrandIcon + <span>MekaSoft</span>
            before 2026-08-19, which diverged from the real logo asset). */}
        <div className="px-5 py-5 border-b border-primary-foreground/10 flex items-center justify-between">
          <div>
            <BrandLogo variant="dark" className="h-7 w-auto" />
            <div className="text-primary-foreground/50 text-[10px] mt-1">v2.1</div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fermer le menu"
            className="lg:hidden w-11 h-11 flex items-center justify-center rounded-sm text-primary-foreground/60 hover:text-primary-foreground"
          >
            <Icon i="x" size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 px-3 py-4 flex-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              onClick={close}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium ${
                active === item.id
                  ? 'bg-primary-foreground/10 text-primary-foreground'
                  : 'text-primary-foreground/60'
              }`}
            >
              <Icon i={item.icon} size={16} />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Bottom — account block. Navigates to the full /profile page
            (2026-08-19) — used to open the "Mon profil" ManagerProfilePanel
            as a right-side slide-over; per user feedback that felt cramped
            for what's really a whole account-settings surface (personal
            info, security, team, logout), so it's now a real page like
            everything else in the nav. */}
        <div className="px-3 pb-4 border-t border-primary-foreground/10 pt-4">
          <Link
            href="/profile"
            onClick={close}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-sm hover:bg-primary-foreground/10 text-left"
          >
            <UserAvatar name={displayName} src={user?.avatarUrl} className="w-8 h-8 rounded-sm" />
            <div>
              <div className="text-primary-foreground text-sm font-medium">{displayName}</div>
              <div className="text-primary-foreground/50 text-xs">{displayRole}</div>
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
