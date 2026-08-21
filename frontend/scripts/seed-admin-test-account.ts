// Bootstrap script — creates/promotes the test SUPERADMIN account requested
// 2026-08-20 ("Ajoute l'email mekasoft2026@gmail.com pour que je puisse
// tester"). Unlike make-superadmin.ts (which requires the user to already
// exist — "Sign up first"), this script creates the account directly with
// a known password and a pre-verified email, so it's usable immediately
// without depending on Resend deliverability for a verification code.
//
// Usage: pnpm tsx --env-file-if-exists=.env --env-file-if-exists=.env.local
//   scripts/seed-admin-test-account.ts
//
// Idempotent — re-running just ensures role=SUPERADMIN/status=ACTIVE and
// leaves the password alone if the account already exists (so it doesn't
// clobber a password the tester may have already changed).
//
// 2026-08-20 run: mekasoft2026@gmail.com already existed as a real
// Google-OAuth account (passwordHash null, created 2026-08-17) — this
// script promoted it to SUPERADMIN in place. The TEST_PASSWORD constant
// below was never used for that account; it only applies if this script
// ever has to CREATE the row from scratch (e.g. a fresh/reset database).
// Sign-in for the existing account is via "Se connecter avec Google", not
// a password.
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { logAdminAction } from '../src/lib/server/admin/audit';

// Inlines auth.ts's own `bcrypt.hash(plain, 12)` rather than importing
// hashPassword from lib/server/auth.ts (PROTECTED file) — that module also
// has an `import 'server-only'` guard which throws outside Next's bundler
// (plain tsx script context), the same reason limits.ts documents for why
// IT avoids the guard. Same algorithm/cost factor, just not importing the
// protected module.
async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

const TEST_EMAIL = 'mekasoft2026@gmail.com';
const TEST_PASSWORD = 'MekaSoftAdmin2026!';

export async function main(deps: { prisma?: PrismaClient } = {}): Promise<number> {
  const prisma = deps.prisma ?? new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });

    if (!existing) {
      const passwordHash = await hashPassword(TEST_PASSWORD);
      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: TEST_EMAIL,
            passwordHash,
            emailVerifiedAt: new Date(),
            role: 'SUPERADMIN',
            status: 'ACTIVE',
            name: 'MekaSoft Admin (test)',
          },
        });
        await logAdminAction(tx, {
          actorId: user.id,
          action: 'BOOTSTRAP_SUPERADMIN',
          targetType: 'User',
          targetId: user.id,
          metadata: { via: 'seed-admin-test-account script', previousRole: null },
        });
        return user;
      });
      console.log(`✓ Created ${TEST_EMAIL} (id=${created.id}) as SUPERADMIN.`);
      console.log(`  Password: ${TEST_PASSWORD}`);
      return 0;
    }

    if (
      existing.role === 'SUPERADMIN' &&
      existing.status === 'ACTIVE' &&
      existing.emailVerifiedAt
    ) {
      console.log(`User ${TEST_EMAIL} already exists as an active SUPERADMIN — no-op.`);
      return 0;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: existing.id },
        data: {
          role: 'SUPERADMIN',
          status: 'ACTIVE',
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        },
      });
      await logAdminAction(tx, {
        actorId: existing.id,
        action: 'BOOTSTRAP_SUPERADMIN',
        targetType: 'User',
        targetId: existing.id,
        metadata: { via: 'seed-admin-test-account script', previousRole: existing.role },
      });
    });
    console.log(
      `✓ Updated ${TEST_EMAIL} (id=${existing.id}) to SUPERADMIN/ACTIVE. Password left unchanged.`,
    );
    return 0;
  } finally {
    if (!deps.prisma) await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
