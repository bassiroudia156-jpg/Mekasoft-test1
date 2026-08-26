// Anonymous SaaS-subscription checkout (2026-08-19) — resolves an
// AnonymousSubscriptionIntent's email into a real Organization once payment
// has succeeded, so the existing `activateSubscription()` (fulfillment.ts)
// can run completely unmodified against a real organizationId. Called from
// each subscription webhook's `onPaid`, inside the same Serializable tx the
// PROTECTED createWebhookHandler factory already runs.
//
// Three cases, in order:
//   1. Email belongs to an existing user who already has an org → reuse it
//      (this is really just "an existing customer paid from the public
//      landing page instead of Settings" — no new account/org needed).
//   2. Email belongs to an existing user with no org yet → create the org
//      for them (their onboarding never finished). They already have a
//      password, so no welcome/set-password email — the normal
//      subscriptionConfirmedEmail is enough.
//   3. Email is brand new → create a passwordless User + Organization +
//      OrganizationMember(OWNER), and issue a PASSWORD_RESET VerificationCode
//      (same mechanism /api/auth/forgot-password uses) with a longer TTL —
//      a paying customer shouldn't have their "claim your account" link
//      expire in the usual 15 minutes. The emailed link reuses the existing,
//      already-tested /reset-password page verbatim; reset-password/route.ts
//      additionally marks emailVerifiedAt on first use (see that file) since
//      successfully consuming the code IS the email-ownership proof here.
import 'server-only';
import { generateVerificationCode } from '../auth';
import { slugify, ensureUniqueSlug } from '../slug';
import type { PrismaTransactionClient } from '../webhook/handler';

// Paying customer, not a routine forgot-password click — give the "claim
// your account" link room to sit unread for a day or two rather than the
// standard 15-minute AUTH_VERIFICATION_TTL_MIN.
const CLAIM_ACCOUNT_TTL_MS =
  Number(process.env.SUBSCRIPTION_CLAIM_ACCOUNT_TTL_HOURS ?? 72) * 60 * 60 * 1000;

export interface AnonymousIntentForResolution {
  id: string;
  email: string;
  atelierName: string;
  phone: string;
}

export type ResolveOrganizationResult =
  | { kind: 'existing_org'; organizationId: string }
  | { kind: 'new_org_existing_user'; organizationId: string }
  | { kind: 'new_org_new_user'; organizationId: string; resetCode: string };

/** Idempotent: safe to call again for the same intent (e.g. a retried
 * webhook) — case 1/2 just resolve to the same org either way, and case 3
 * only fires once per email since the second call finds the just-created
 * user via case 1/2. */
export async function resolveOrganizationForAnonymousIntent(
  tx: PrismaTransactionClient,
  intent: AnonymousIntentForResolution,
): Promise<ResolveOrganizationResult> {
  const existingUser = await tx.user.findUnique({
    where: { email: intent.email },
    select: { id: true },
  });

  if (existingUser) {
    const membership = await tx.organizationMember.findFirst({
      where: { userId: existingUser.id },
      select: { organizationId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (membership) {
      return { kind: 'existing_org', organizationId: membership.organizationId };
    }

    let created: { id: string } | undefined;
    await ensureUniqueSlug(slugify(intent.atelierName), async (candidateSlug) => {
      created = await tx.organization.create({
        data: {
          slug: candidateSlug,
          name: intent.atelierName,
          phone: intent.phone,
          ownerId: existingUser.id,
        },
        select: { id: true },
      });
      return created;
    });
    if (!created) throw new Error('Organization creation did not produce a row');

    await tx.organizationMember.create({
      data: { organizationId: created.id, userId: existingUser.id, role: 'OWNER' },
    });
    return { kind: 'new_org_existing_user', organizationId: created.id };
  }

  const user = await tx.user.create({
    data: { email: intent.email },
    select: { id: true },
  });

  let created: { id: string } | undefined;
  await ensureUniqueSlug(slugify(intent.atelierName), async (candidateSlug) => {
    created = await tx.organization.create({
      data: {
        slug: candidateSlug,
        name: intent.atelierName,
        phone: intent.phone,
        ownerId: user.id,
      },
      select: { id: true },
    });
    return created;
  });
  if (!created) throw new Error('Organization creation did not produce a row');

  await tx.organizationMember.create({
    data: { organizationId: created.id, userId: user.id, role: 'OWNER' },
  });

  const resetCode = generateVerificationCode();
  await tx.verificationCode.create({
    data: {
      userId: user.id,
      code: resetCode,
      type: 'PASSWORD_RESET',
      expiresAt: new Date(Date.now() + CLAIM_ACCOUNT_TTL_MS),
    },
  });

  return { kind: 'new_org_new_user', organizationId: created.id, resetCode };
}
