'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import BrandLogo from '@/components/ui/BrandLogo';
import UserAvatar from '@/components/ui/UserAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileSidebar } from '@/contexts/MobileSidebarContext';
import { useCallerOrganization } from '@/lib/useCallerOrganization';
import { orgRoleLabel } from '@/lib/roleLabel';
import LogoutConfirmModal from '@/components/auth/LogoutConfirmModal';

// Mirrors lib/server/plans/limits.ts's PLAN_PRICING labels — same
// local-copy convention as profile/page.tsx (that module lives under
// lib/server/, this is client-rendered display copy).
const PLAN_LABEL: Record<string, string> = { FREE: 'Gratuit', PRO: 'Pro', BUSINESS: 'Business' };

export type SidebarActiveKey =
  | 'dashboard'
  | 'interventions'
  | 'clients'
  | 'vehicles'
  | 'quotes'
  | 'invoices'
  | 'payments'
  // Not a NAV_ITEMS entry (the account block below isn't part of that list)
  // — exists purely so /profile can pass an honest value instead of not
  // highlighting anything.
  | 'profile';

// Every item now has a real route. This was a plain `<a href="#">` through
// Phases 1–5 (the sidebar never actually navigated), fixed while wiring
// /invoices in Phase 6; "Paiements" was the last `href: null` holdout,
// filled in Phase 7. "Paramètres" (added Phase 8, briefly renamed "Export")
// removed for good 2026-08-19 — Atelier/Abonnement live on /profile
// (reachable via the account block below) and Export lives inline on
// /dashboard (see ExportMenu), so there's nothing left for a dedicated nav
// item to point at. /settings itself is now just a redirect stub to
// /profile for old bookmarks/links — deliberately not in this list.
const NAV_ITEMS: { id: SidebarActiveKey; icon: string; label: string; href: string }[] = [
  { id: 'dashboard', icon: 'layout-dashboard', label: 'Tableau de bord', href: '/dashboard' },
  { id: 'interventions', icon: 'wrench', label: 'Interventions', href: '/interventions' },
  { id: 'clients', icon: 'users', label: 'Clients', href: '/clients' },
  { id: 'vehicles', icon: 'car', label: 'Véhicules', href: '/vehicles' },
  { id: 'quotes', icon: 'file-check', label: 'Devis', href: '/quotes' },
  { id: 'invoices', icon: 'file-text', label: 'Factures', href: '/invoices' },
  { id: 'payments', icon: 'banknote', label: 'Paiements', href: '/payments' },
];

// 2026-08-25 — PRD US-09: a Mécanicien sees/edits interventions but never
// reaches devis/factures/paiements. The backend already refuses these two
// (requireBillingAccess, see lib/server/organizations/require-caller-org.ts)
// — hiding the links here is just "no dead UI": a Mécanicien clicking
// either would otherwise land on a real page that immediately errors.
const BILLING_NAV_IDS: SidebarActiveKey[] = ['quotes', 'invoices', 'payments'];

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
  const { user, logout } = useAuth();
  const router = useRouter();
  const { open, close } = useMobileSidebar();
  const { plan, loading: planLoading } = useCallerOrganization(!!user);
  const displayName = user?.name ?? user?.email ?? 'Mon compte';
  const displayRole = user ? orgRoleLabel(user.orgRole, user.jobTitle) : '';
  const isMechanic = user?.jobTitle === 'Mécanicien';
  const navItems = isMechanic
    ? NAV_ITEMS.filter((item) => !BILLING_NAV_IDS.includes(item.id))
    : NAV_ITEMS;

  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function confirmLogout() {
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
    setLogoutModalOpen(false);
    close();
    router.push('/login?logged_out=1');
  }

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
          {navItems.map((item) => (
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

        {/* Admin button (2026-08-20) — visible only to ADMIN/SUPERADMIN,
            gives quick access to the back-office without hunting for a
            URL. Purely a convenience link — every /admin/* page and API
            route re-checks the role server-side regardless. Placed above
            the account block so it reads as a distinct, elevated action
            rather than folded into the regular nav items above. */}
        {user && (user.role === 'ADMIN' || user.role === 'SUPERADMIN') && (
          <div className="px-3 pb-1">
            <Link
              href="/admin"
              onClick={close}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium bg-accent/15 text-accent hover:bg-accent/25"
            >
              <Icon i="shield" size={16} />
              Admin
            </Link>
          </div>
        )}

        {/* Bottom — account block. Navigates to the full /profile page
            (2026-08-19) — used to open the "Mon profil" ManagerProfilePanel
            as a right-side slide-over; per user feedback that felt cramped
            for what's really a whole account-settings surface (personal
            info, security, team, logout), so it's now a real page like
            everything else in the nav. A direct "Déconnexion" button was
            added right below it (2026-08-19, follow-up feedback) — the
            profile page already has one, but users expect to be able to
            log out from the sidebar itself without an extra navigation.
            Plan row added 2026-08-20, between the two — moved here from the
            dashboard TopBar per user request, and this is now the ONLY
            upgrade CTA in the app (no duplicate elsewhere): FREE and PRO
            orgs see a quiet reminder + "Upgrader" link (pointing at the
            full pricing grid, which covers the next tier up either way) on
            every authenticated page; a BUSINESS org — the top tier — sees
            its plan confirmed instead, no CTA. */}
        <div className="px-3 pb-4 border-t border-primary-foreground/10 pt-4 flex flex-col gap-1">
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

          {!planLoading &&
            (plan !== 'BUSINESS' ? (
              <Link
                href="/subscriptions/plans"
                onClick={close}
                aria-label="Upgrader mon abonnement"
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-sm bg-accent/15 hover:bg-accent/25 text-left transition-colors"
              >
                <span className="flex items-center gap-1.5 text-primary-foreground/70 text-xs font-medium">
                  <Icon i="zap" size={12} className="text-accent" />
                  Plan {PLAN_LABEL[plan] ?? plan}
                </span>
                <span className="text-xs font-semibold text-accent">Upgrader</span>
              </Link>
            ) : (
              <div className="w-full flex items-center gap-1.5 px-3 py-2 rounded-sm bg-primary-foreground/10">
                <Icon i="crown" size={12} className="text-accent" />
                <span className="text-primary-foreground/80 text-xs font-medium">
                  Plan {PLAN_LABEL[plan] ?? plan}
                </span>
              </div>
            ))}

          <button
            type="button"
            onClick={() => setLogoutModalOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium text-primary-foreground/60 hover:bg-primary-foreground/10 hover:text-primary-foreground text-left"
          >
            <Icon i="log-out" size={16} />
            Déconnexion
          </button>
        </div>
      </div>

      {user && (
        <LogoutConfirmModal
          open={logoutModalOpen}
          onCancel={() => setLogoutModalOpen(false)}
          onConfirm={() => void confirmLogout()}
          userEmail={user.email}
          userLabel={`${displayName} • ${displayRole}`}
          confirming={loggingOut}
        />
      )}
    </>
  );
}
