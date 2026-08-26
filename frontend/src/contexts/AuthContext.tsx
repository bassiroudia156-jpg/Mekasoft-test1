'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, clearCsrfToken, storeCsrfToken } from '@/lib/api';
import { invalidateCachePrefix } from '@/lib/useApi';
import { COOKIE_PREFIX } from '@/lib/constants';

export interface User {
  id: string;
  email: string;
  /** Full display name, e.g. "Moussa Diallo". Null until set (OAuth prefill or EditProfileModal). */
  name: string | null;
  /** E.164 phone, editable via EditProfileModal / PATCH /api/auth/me. */
  phone: string | null;
  /** Real photo URL (OAuth prefill or user upload) — null falls back to initials everywhere. */
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** false when the account was created via OAuth and never set a password. */
  hasPassword: boolean;
  /** Provider names already linked, e.g. ['google']. Empty for pure email/password accounts. */
  linkedProviders: string[];
  /** Null while the caller has no organization yet (Phase 2's org-less state). */
  organizationId: string | null;
  /** OWNER | ADMIN | MEMBER — null alongside organizationId. */
  orgRole: string | null;
  /** Cosmetic job-title label (Gérant / Mécanicien / …) — display only, see TeamManagementModal. */
  jobTitle: string | null;
  /** App-wide role — USER | ADMIN | SUPERADMIN. Gates the header "Admin"
   * button (2026-08-20). Purely presentational client-side; every admin
   * route re-checks this server-side regardless. */
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  loggingOut: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// 2026-08-19: set right before an explicit logout() clears `user`, read by
// useUser()'s own auto-redirect effect below. Every logout entry point
// (Sidebar, /profile, PublicNav) already does its own
// `router.push('/login?logged_out=1')` right after `await logout()` — but
// useUser()'s protective "no session, bounce to redirectTo" effect ALSO
// fires the instant `user` flips to null (same render, since both read the
// same state), and since both are `router.*` calls racing to update the
// same history entry, whichever commits second wins and can silently drop
// the query string, killing the "you were logged out" toast on /login.
// Rather than fight that ordering, make both navigations resolve to the
// identical URL: this flag carries the query string over to the automatic
// redirect so it doesn't matter which one "wins". Cleared on the next
// successful fetchUser() so a later silent session expiry (not a real
// logout) doesn't misreport itself as one.
let pendingLogoutQuery = '';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ user: User; csrfToken?: string }>('/api/auth/me');
      setUser(res.user);
      pendingLogoutQuery = '';
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Too many requests. Wait a few minutes and try again.');
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : 'Cannot reach the server. Check your network and try again.';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skip /me for anonymous visitors — the JS-readable CSRF cookie is only
    // set after login, so its absence is a reliable "no session" signal.
    const csrfCookieName = `${COOKIE_PREFIX}-csrf`;
    const hasCookie = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith(`${csrfCookieName}=`));
    if (!hasCookie) {
      setLoading(false);
      return;
    }
    void fetchUser();
    // Run once on mount; fetchUser is stable.
  }, []);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore — cookie will expire anyway
    }
    clearCsrfToken();
    invalidateCachePrefix('/api/');
    pendingLogoutQuery = '?logged_out=1';
    setUser(null);
    setLoggingOut(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loggingOut, error, refresh: fetchUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

const SSR_STUB: AuthContextValue = {
  user: null,
  loading: true,
  loggingOut: false,
  error: null,
  refresh: async () => {},
  logout: async () => {},
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    if (typeof window === 'undefined') return SSR_STUB;
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}

/**
 * Auth-required helper — returns the user, or redirects to the configured
 * login path if logged out. Use on pages that require an authenticated
 * session so each page doesn't reimplement the same `if (!user) router.push`.
 *
 *   export default function DashboardPage() {
 *     const user = useUser();         // never null inside the body
 *     if (!user) return null;         // null while redirecting / loading
 *     return <div>Hello {user.email}</div>;
 *   }
 *
 * Default redirect target is `/login`; override via the `redirectTo` arg.
 * Returns `null` while loading OR while the redirect is in flight, so the
 * UI can render a stub. Use the `loading` field of useAuth() if you want
 * to render a spinner explicitly.
 */
export function useUser(redirectTo: string = '/login'): User | null {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      const target = pendingLogoutQuery
        ? `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}${pendingLogoutQuery.slice(1)}`
        : redirectTo;
      router.replace(target);
    }
  }, [loading, user, redirectTo, router]);

  if (loading || !user) return null;
  return user;
}
