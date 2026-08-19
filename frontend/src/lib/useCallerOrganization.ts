'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface OrgSummary {
  id: string;
  slug: string;
  name: string;
  plan?: string;
}

export interface CallerOrganization {
  organizationId: string | null;
  /** FREE | PRO | BUSINESS — 'FREE' while loading/absent so plan-gated UI
   * fails closed (hidden) rather than briefly flashing a locked feature. */
  plan: string;
  loading: boolean;
}

// V1 is single-org-per-user (see Phase 2) — every page that needs "the
// current organization" (for ManagerProfilePanel's team section, or to
// gate a page behind having one at all) shares this instead of
// re-implementing the GET /api/organizations dance each time. `plan` added
// 2026-08-18 for plan-gated UI (WhatsApp share, logo upload, exports…) —
// same single fetch, additive field, existing consumers unaffected.
export function useCallerOrganization(enabled: boolean): CallerOrganization {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [plan, setPlan] = useState('FREE');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ organizations: OrgSummary[] }>('/api/organizations');
        if (!cancelled) {
          setOrganizationId(res.organizations[0]?.id ?? null);
          setPlan(res.organizations[0]?.plan ?? 'FREE');
        }
      } catch {
        // Leave null/FREE — callers treat null the same as "no org yet".
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { organizationId, plan, loading };
}
