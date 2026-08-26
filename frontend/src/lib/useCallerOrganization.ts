'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface OrgSummary {
  id: string;
  slug: string;
  name: string;
  plan?: string;
  street?: string | null;
  city?: string | null;
  taxId?: string | null;
}

export interface CallerOrganization {
  organizationId: string | null;
  /** FREE | PRO | BUSINESS — 'FREE' while loading/absent so plan-gated UI
   * fails closed (hidden) rather than briefly flashing a locked feature. */
  plan: string;
  loading: boolean;
  // Added 2026-08-19 for /profile's Atelier card (moved there from the
  // retired /settings page) — same single fetch as organizationId/plan
  // above, additive fields, existing consumers unaffected.
  name: string | null;
  street: string | null;
  city: string | null;
  taxId: string | null;
}

// V1 is single-org-per-user (see Phase 2) — every page that needs "the
// current organization" (for ManagerProfilePanel's team section, or to
// gate a page behind having one at all) shares this instead of
// re-implementing the GET /api/organizations dance each time. `plan` added
// 2026-08-18 for plan-gated UI (logo upload, exports…) — same single fetch,
// additive field, existing consumers unaffected.
export function useCallerOrganization(enabled: boolean): CallerOrganization {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [plan, setPlan] = useState('FREE');
  const [name, setName] = useState<string | null>(null);
  const [street, setStreet] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [taxId, setTaxId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ organizations: OrgSummary[] }>('/api/organizations');
        const org = res.organizations[0];
        if (!cancelled) {
          setOrganizationId(org?.id ?? null);
          setPlan(org?.plan ?? 'FREE');
          setName(org?.name ?? null);
          setStreet(org?.street ?? null);
          setCity(org?.city ?? null);
          setTaxId(org?.taxId ?? null);
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

  return { organizationId, plan, loading, name, street, city, taxId };
}
