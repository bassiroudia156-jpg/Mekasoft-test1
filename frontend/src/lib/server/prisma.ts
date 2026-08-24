// 2026-08-24 — security audit hardening (control #6, server/client boundary
// hygiene). Every other server module in this tree starts with this import;
// this file — the shared Prisma singleton — was the one exception. No
// exploit was demonstrated (nothing currently imports this from a Client
// Component), but without the guard an accidental client-side import would
// fail silently instead of at build time like everywhere else.
import 'server-only';
import { PrismaClient } from '@prisma/client';

declare global {
  // `var` is required for `declare global` to attach to globalThis.

  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
