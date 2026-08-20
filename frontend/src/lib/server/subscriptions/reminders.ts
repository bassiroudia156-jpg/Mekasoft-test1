// Relance logic — finds MONEROO/CHARIOW subscriptions approaching expiry
// and sends an email (+ WhatsApp when configured) reminder. STRIPE
// subscriptions are never candidates here: they auto-renew via card, so a
// "renew manually" reminder would be actively confusing.
//
// Injectable `prisma` (default the real client) — same pattern as
// reports/monthly.ts / orders/expire.ts, testable without the vi.mock
// hoisting dance.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma';
import { getEmailQueue } from '../queues/email-queue-singleton';
import { getWhatsAppClient } from './whatsapp';
import { subscriptionReminderEmail, subscriptionReminderWhatsAppText } from './reminder-templates';
import { createLogger } from '../logger';

const log = createLogger();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function parseReminderTiers(): number[] {
  const raw = process.env.SUBSCRIPTION_REMINDER_DAYS_BEFORE ?? '7,3,1';
  const tiers = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  // Descending — tiers[0] is the FIRST (earliest, largest days-before)
  // reminder; remindersSent indexes into this array as tiers get crossed.
  return tiers.length > 0 ? tiers.sort((a, b) => b - a) : [7, 3, 1];
}

export interface SendRemindersOptions {
  prisma?: PrismaClient;
  /** Base URL for the renewal link — defaults to APP_URL, same env other
   * templates (team-invite) already read. */
  appUrl?: string;
}

export interface SendRemindersResult {
  candidates: number;
  emailsSent: number;
  whatsappSent: number;
  skipped: number;
}

/**
 * Cron entry point (called by app/api/cron/subscription-reminders/route.ts).
 * Batch size is implicit — the candidate query is already narrow (only
 * ACTIVE MONEROO/CHARIOW subs within the widest configured tier), so no
 * pagination is needed at MekaSoft's expected scale.
 */
export async function sendSubscriptionReminders(
  opts: SendRemindersOptions = {},
): Promise<SendRemindersResult> {
  const client = opts.prisma ?? defaultPrisma;
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? 'http://localhost:3000';
  const tiers = parseReminderTiers();
  const widestTierDays = tiers[0]!;
  const now = new Date();

  const candidates = await client.subscription.findMany({
    where: {
      status: 'ACTIVE',
      provider: { in: ['MONEROO', 'CHARIOW'] },
      currentPeriodEnd: { lte: new Date(now.getTime() + widestTierDays * ONE_DAY_MS) },
      remindersSent: { lt: tiers.length },
    },
    include: {
      organization: {
        select: { name: true, phone: true, contactEmail: true, owner: { select: { email: true } } },
      },
    },
  });

  let emailsSent = 0;
  let whatsappSent = 0;
  let skipped = 0;

  for (const sub of candidates) {
    const daysUntilExpiry = Math.ceil(
      (sub.currentPeriodEnd.getTime() - now.getTime()) / ONE_DAY_MS,
    );
    if (daysUntilExpiry < 0) {
      // Already lapsed — downgrade.ts's job, not this one's.
      skipped++;
      continue;
    }
    const nextTierDays = tiers[sub.remindersSent];
    if (nextTierDays === undefined || daysUntilExpiry > nextTierDays) {
      skipped++;
      continue;
    }

    // Single paid plan now (2026-08-20, BUSINESS retired — see
    // lib/server/plans/limits.ts's header comment); a stale `sub.plan`
    // value from before the retirement is not worth branching on here.
    const renewUrl = `${appUrl}/profile`;
    const templateArgs = {
      organizationName: sub.organization.name,
      plan: 'PRO' as const,
      daysUntilExpiry,
      renewUrl,
    };

    const to = sub.organization.contactEmail ?? sub.organization.owner.email;
    const emailQueue = getEmailQueue();
    if (emailQueue && to) {
      const tpl = subscriptionReminderEmail(templateArgs);
      try {
        await emailQueue.enqueue({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
        emailsSent++;
      } catch (err) {
        log.error('subscription-reminders: email enqueue failed', {
          organizationId: sub.organizationId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const whatsapp = getWhatsAppClient();
    if (whatsapp && sub.organization.phone) {
      try {
        await whatsapp.send(sub.organization.phone, subscriptionReminderWhatsAppText(templateArgs));
        whatsappSent++;
      } catch (err) {
        // Best-effort — a failed WhatsApp send never blocks the email path
        // or the remindersSent bookkeeping (retrying same-tier every cron
        // tick until it succeeds would spam email too).
        log.warn('subscription-reminders: whatsapp send failed', {
          organizationId: sub.organizationId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await client.subscription.update({
      where: { id: sub.id },
      data: { remindersSent: { increment: 1 }, lastReminderSentAt: now },
    });
  }

  log.info('subscription-reminders tick', {
    candidates: candidates.length,
    emailsSent,
    whatsappSent,
    skipped,
  });

  return { candidates: candidates.length, emailsSent, whatsappSent, skipped };
}
