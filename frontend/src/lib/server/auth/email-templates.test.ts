import { describe, it, expect, afterEach, vi } from 'vitest';
import { verificationEmail, resetPasswordEmail } from './email-templates';

describe('verificationEmail', () => {
  it('returns { subject, html, text } all non-empty', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.subject).toBeTruthy();
    expect(t.html).toBeTruthy();
    expect(t.text).toBeTruthy();
  });

  it('embeds the code in both html and text', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.html).toContain('ABCD2345');
    expect(t.text).toContain('ABCD2345');
  });

  it('subject matches expected', () => {
    const t = verificationEmail({ code: 'XYZ12345', email: 'x@y.com' });
    expect(t.subject).toBe('Votre code de vérification MekaSoft');
  });

  it('html is branded (MekaSoft wordmark present)', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.html).toContain('Mekasoft'.slice(0, 4)); // "Meka"
    expect(t.html).toContain('soft');
  });

  it('renders "dans N minutes" when expiresAt is provided (O1 audit fix)', () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', expiresAt });
    // floor-biased: with 15 min remaining the actual rendered value can be
    // 14 or 15 — either is acceptable.
    expect(t.text).toMatch(/dans 1[45] minutes/);
    expect(t.html).toMatch(/dans 1[45] minutes/);
  });

  it('renders "dans N heures" for multi-hour TTLs', () => {
    // +1 min buffer so the floor-biased rounding can't drop minutes to 119
    // (which would render "dans 1 heure" instead of "dans 2 heures" — a
    // latent flake fixed by audit pass 2).
    const expiresAt = new Date(Date.now() + 2 * 60 * 60_000 + 60_000).toISOString();
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', expiresAt });
    expect(t.text).toContain('dans 2 heures');
  });

  it('falls back to "bientôt" when expiresAt is omitted', () => {
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.text).toContain('expire bientôt');
  });

  it('falls back to "bientôt" when expiresAt is malformed', () => {
    const t = verificationEmail({
      code: 'ABCD2345',
      email: 'a@b.com',
      expiresAt: 'not-an-iso-date',
    });
    expect(t.text).toContain('expire bientôt');
  });

  it('falls back to "bientôt" when expiresAt is already in the past', () => {
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    const t = verificationEmail({ code: 'ABCD2345', email: 'a@b.com', expiresAt });
    expect(t.text).toContain('expire bientôt');
  });
});

describe('resetPasswordEmail', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns { subject, html, text } all non-empty', () => {
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com' });
    expect(t.subject).toBeTruthy();
    expect(t.html).toBeTruthy();
    expect(t.text).toBeTruthy();
  });

  // 2026-08-24, explicit user request — the email must deliver a clickable
  // link, not a bare code to retype. The code is still embedded (as the
  // link's ?code= param, consumed by /reset-password/page.tsx), but it must
  // never appear on its own outside a URL.
  it('embeds a clickable reset link (not a bare code) in the html, and the link in the text', () => {
    vi.stubEnv('APP_URL', 'https://mekasoft.app');
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com' });
    const expectedUrl = 'https://mekasoft.app/reset-password?email=a%40b.com&code=WXYZ9876';
    // html is HTML-escaped for the attribute (& -> &amp;); text is the raw URL.
    expect(t.html).toContain(`href="${expectedUrl.replace('&', '&amp;')}"`);
    expect(t.text).toContain(expectedUrl);
  });

  it('URL-encodes the email and code query params', () => {
    vi.stubEnv('APP_URL', 'https://mekasoft.app');
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a+test@b.com' });
    expect(t.html).toContain('email=a%2Btest%40b.com');
  });

  it('falls back to localhost:3000 when APP_URL is unset', () => {
    vi.stubEnv('APP_URL', '');
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com' });
    expect(t.text).toContain('http://localhost:3000/reset-password?email=a%40b.com&code=WXYZ9876');
  });

  it('subject matches expected', () => {
    const t = resetPasswordEmail({ code: 'ABCD2345', email: 'a@b.com' });
    expect(t.subject).toBe('Réinitialisation de votre mot de passe MekaSoft');
  });

  it('renders "dans N minutes" when expiresAt is provided (O1 audit fix)', () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const t = resetPasswordEmail({ code: 'WXYZ9876', email: 'a@b.com', expiresAt });
    expect(t.text).toMatch(/dans 1[45] minutes/);
  });
});
