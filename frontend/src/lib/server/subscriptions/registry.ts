// Resolves a SubscriptionProvider by name. Mirrors
// lib/server/payments/provider-singleton.ts's "throw a typed unconfigured
// error, route translates to 503" pattern — but keyed by provider name
// since here we have three concurrent providers instead of one.
import 'server-only';
import { stripeSubscriptionProvider } from './stripe';
import { monerooSubscriptionProvider } from './moneroo';
import { chariowSubscriptionProvider } from './chariow';
import type { SubscriptionProvider, SubscriptionProviderName } from './types';

export class SubscriptionProviderUnconfiguredError extends Error {
  constructor(public readonly provider: SubscriptionProviderName) {
    super(`Subscription provider ${provider} is not configured (env vars missing or empty)`);
    this.name = 'SubscriptionProviderUnconfiguredError';
  }
}

const PROVIDERS: Record<SubscriptionProviderName, SubscriptionProvider> = {
  STRIPE: stripeSubscriptionProvider,
  MONEROO: monerooSubscriptionProvider,
  CHARIOW: chariowSubscriptionProvider,
};

/** Throws `SubscriptionProviderUnconfiguredError` if the provider's
 * credentials (env vars, or for Chariow also its admin-editable DB
 * override — see credentials.ts) are missing — routes catch that instance
 * and return 503 SUBSCRIPTION_PROVIDER_UNCONFIGURED.
 *
 * Async (2026-08-22, was sync): Chariow's isConfigured() now needs a DB
 * read to check its override, so every caller here awaits — Stripe/Moneroo
 * stay sync internally, `await`ing a non-Promise just resolves it as-is. */
export async function getSubscriptionProvider(
  name: SubscriptionProviderName,
): Promise<SubscriptionProvider> {
  const provider = PROVIDERS[name];
  if (!(await provider.isConfigured())) {
    throw new SubscriptionProviderUnconfiguredError(name);
  }
  return provider;
}

/** Which of the 3 providers are currently usable — drives the Settings page
 * checkout UI (only show buttons for providers with real credentials
 * configured, env var or DB override). */
export async function listConfiguredProviders(): Promise<SubscriptionProviderName[]> {
  const names = Object.keys(PROVIDERS) as SubscriptionProviderName[];
  const flags = await Promise.all(names.map((name) => PROVIDERS[name].isConfigured()));
  return names.filter((_, i) => flags[i]);
}
