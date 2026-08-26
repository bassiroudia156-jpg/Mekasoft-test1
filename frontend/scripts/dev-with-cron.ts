// frontend/scripts/dev-with-cron.ts
//
// Wraps `next dev` so local development also drains the outbox + email
// queue automatically — without this, `pnpm dev` alone can silently queue
// invoice emails, verification codes, password resets and team invites
// that never leave the outbox.
//
// WHY THIS EXISTS: every outbound email in the app (invoice send/resend,
// signup verification code, forgot-password, team invite) is emitted as an
// OutboxEvent, not sent synchronously (see CLAUDE.md "Webhook idempotency +
// outbox"). In production, Vercel Cron hits POST /api/cron/outbox-drain and
// POST /api/cron/email-queue-drain every minute (see ../vercel.json) to
// actually dispatch those events through Resend. Vercel Cron only exists on
// deployed environments — `next dev` never calls these routes — so on a
// fresh `pnpm dev` an enqueued email just sits PENDING forever with no
// error surfaced anywhere the operator would see it (2026-08-19 incident:
// a real invoice resend stayed PENDING for hours; Resend itself was
// correctly configured the whole time, nothing was ever wrong with the API
// key — the cron simply never ran).
//
// This script spawns `next dev` as a child process (unchanged behavior)
// and, in parallel, polls the two email-relevant cron routes locally on a
// short interval so anything queued while you're developing actually goes
// out within seconds instead of never. It is dev-only tooling, not part of
// the deployed app — the real crons in vercel.json are unaffected.
import { spawn } from 'node:child_process';

const PORT = process.env.PORT ?? '3000';
const BASE_URL = `http://localhost:${PORT}`;
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const POLL_INTERVAL_MS = 15_000;
const FIRST_POLL_DELAY_MS = 5_000; // give `next dev` a moment to boot

// Only the two routes that gate outbound email — draining the rest
// (verification-cleanup, order-expiration, purges, subscription crons) on a
// dev machine isn't needed to answer "did my email send".
const EMAIL_CRON_PATHS = ['/api/cron/outbox-drain', '/api/cron/email-queue-drain'];

// Single command string (not `spawn(cmd, args, {shell:true})`) — passing an
// argv array alongside shell:true triggers Node's DEP0190 warning since the
// args get concatenated rather than escaped. PORT is our own trusted env
// var, not user input, so string interpolation here is safe.
const next = spawn(`next dev --port ${PORT} --turbopack`, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

next.on('exit', (code) => process.exit(code ?? 0));
next.on('error', (err) => {
  console.error('[dev-with-cron] failed to start next dev:', err);
  process.exit(1);
});

if (!CRON_SECRET) {
  console.warn(
    '[dev-with-cron] CRON_SECRET is not set — outbox/email-queue will NOT auto-drain locally. ' +
      'Invoice emails, verification codes, password resets and team invites will stay queued ' +
      'until CRON_SECRET is set (see .env.local) and the dev server restarted.',
  );
} else {
  setTimeout(() => {
    console.log(
      `[dev-with-cron] polling outbox + email queue every ${POLL_INTERVAL_MS / 1000}s so local emails actually send`,
    );
    setInterval(() => {
      void Promise.allSettled(
        EMAIL_CRON_PATHS.map((path) =>
          fetch(`${BASE_URL}${path}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${CRON_SECRET}` },
          }),
        ),
      );
      // Failures are swallowed on purpose: during the first few ticks the
      // dev server may still be compiling the route (Turbopack lazy-compiles
      // on first hit), and transient errors here shouldn't spam the
      // terminal the app's own `next dev` output already owns. If email
      // never arrives, check the OutboxEvent/EmailJob tables' `lastError`.
    }, POLL_INTERVAL_MS);
  }, FIRST_POLL_DELAY_MS);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    next.kill(sig);
    process.exit(0);
  });
}
