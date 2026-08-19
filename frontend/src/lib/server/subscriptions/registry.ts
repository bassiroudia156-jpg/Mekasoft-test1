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

/** Throws `SubscriptionProviderUnconfiguredError` if the provider's env vars
 * are missing — routes catch that instance and return 503
 * SUBSCRIPTION_PROVIDER_UNCONFIGURED. */
export function getSubscriptionProvider(name: SubscriptionProviderName): SubscriptionProvider {
  const provider = PROVIDERS[name];
  if (!provider.isConfigured()) {
    throw new SubscriptionProviderUnconfiguredError(name);
  }
  return provider;
}

/** Which of the 3 providers are currently usable — drives the Settings page
 * checkout UI (only show buttons for providers with real env configured). */
export function listConfiguredProviders(): SubscriptionProviderName[] {
  return (Object.keys(PROVIDERS) as SubscriptionProviderName[]).filter((name) =>
    PROVIDERS[name].isConfigured(),
  );
}
