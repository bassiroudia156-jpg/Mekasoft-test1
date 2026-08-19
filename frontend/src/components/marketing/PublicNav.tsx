'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BrandLogo from '@/components/ui/BrandLogo';
import { useAuth } from '@/contexts/AuthContext';
import LogoutConfirmModal from '@/components/auth/LogoutConfirmModal';

const NAV_LINKS = [
  { label: 'Fonctionnalités', href: '/#fonctionnalites' },
  { label: 'Comment ça marche', href: '/#comment-ca-marche' },
  { label: 'Tarifs', href: '/#tarifs' },
  { label: 'FAQ', href: '/#faq' },
];

// Shared public nav — Banani ships this identically across LandingPage,
// TermsOfUse and PrivacyPolicy (3 occurrences) but as two structurally
// different mockups (LandingPage.jsx desktop vs LandingPageMobile.jsx),
// not one responsive file: mobile only shows the logo + a single
// "Commencer" button, desktop adds the anchor links + "Se connecter".
// Merged here into one component — the link list + "Se connecter" only
// render at lg:, the CTA's label swaps via two spans rather than
// duplicating the whole button. `/#slug` links work both from the landing
// page itself (native anchor scroll) and from /terms /privacy (full
// navigation to `/` then scroll).
//
// 2026-08-19: client component now (was a plain server component, "no
// client JS needed" per LandingPage's own old comment) — needs useAuth() to
// swap "Se connecter"/"Commencer gratuitement" for a single "Se déconnecter"
// when the visitor already has a session, so an already-logged-in user
// landing on the public marketing pages isn't offered a signup CTA. Briefly
// shows the logged-out buttons while the auth check resolves (this app's
// auth state is entirely client-driven, see AuthContext) — same trade-off
// every client-auth page in this app already accepts.
export default function PublicNav() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const isLoggedIn = !loading && !!user;

  async function confirmLogout() {
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
    setLogoutModalOpen(false);
    router.push('/login?logged_out=1');
  }

  return (
    <nav className="border-b border-border bg-background px-4 py-3 lg:px-12 lg:py-4 flex items-center justify-between">
      <div className="flex items-center gap-10">
        <Link href="/" aria-label="MekaSoft">
          <BrandLogo variant="light" className="h-14 lg:h-16 w-auto" />
        </Link>
        <div className="hidden lg:flex gap-6">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground font-medium hover:text-foreground transition-colors duration-150"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isLoggedIn ? (
          <button
            type="button"
            onClick={() => setLogoutModalOpen(true)}
            className="text-xs lg:text-sm bg-primary text-primary-foreground font-medium px-3 py-2 lg:px-4 rounded-md hover:bg-primary/90 hover:scale-[1.04] active:scale-[0.97] transition-all duration-200"
          >
            Se déconnecter
          </button>
        ) : (
          <>
            <Link
              href="/login"
              className="hidden lg:inline-block text-sm text-foreground font-medium px-4 py-2 hover:text-primary"
            >
              Se connecter
            </Link>
            <Link
              href="/signup"
              className="text-xs lg:text-sm bg-primary text-primary-foreground font-medium px-3 py-2 lg:px-4 rounded-md hover:bg-primary/90 hover:scale-[1.04] active:scale-[0.97] transition-all duration-200"
            >
              <span className="lg:hidden">Commencer</span>
              <span className="hidden lg:inline">Commencer gratuitement</span>
            </Link>
          </>
        )}
      </div>

      {isLoggedIn && (
        <LogoutConfirmModal
          open={logoutModalOpen}
          onCancel={() => setLogoutModalOpen(false)}
          onConfirm={() => void confirmLogout()}
          userEmail={user.email}
          confirming={loggingOut}
        />
      )}
    </nav>
  );
}
