// Shared branded HTML shell for transactional auth emails (verification
// code, password reset, team invite) — added 2026-08-18 per explicit user
// request: apply MekaSoft's visual identity, but keep it simple enough to
// stay out of spam filters.
//
// Deliberately minimal by design (all of these are spam-avoidance choices,
// not just taste):
//   - No remote images (a raster logo would need image-blocking-safe alt
//     text anyway, and remote-image-loading is one of the signals spam
//     filters weigh) — the "Meka/soft" wordmark is styled text.
//   - Inline styles only, one nesting level, no <style> block — many email
//     clients (Gmail, Outlook) strip <head><style> or mis-render class-based
//     CSS; inline styles are the only universally-reliable approach.
//   - A single accent color block (the top bar) instead of a busy layout —
//     visually on-brand without looking like a marketing blast.
//   - Plain, non-shouty copy (no ALL CAPS, no excess "!", no urgency
//     language) — both templates already read calmly; kept that way.
import 'server-only';

const COLORS = {
  background: '#f5f4f0',
  surface: '#ffffff',
  border: '#d4d0c8',
  primary: '#152A4E',
  primaryForeground: '#ffffff',
  accent: '#DE6A34',
  foreground: '#0d1b2a',
  mutedForeground: '#7a7568',
};

export function brandedEmailHtml(bodyHtml: string): string {
  return `<div style="background:${COLORS.background};padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:8px;overflow:hidden;">
    <div style="background:${COLORS.primary};padding:18px 24px;">
      <span style="font-size:18px;font-weight:bold;color:${COLORS.primaryForeground};">
        <span style="color:${COLORS.accent};">Meka</span>soft
      </span>
    </div>
    <div style="padding:28px 24px;color:${COLORS.foreground};font-size:14px;line-height:1.6;">
      ${bodyHtml}
    </div>
    <div style="padding:16px 24px;border-top:1px solid ${COLORS.border};color:${COLORS.mutedForeground};font-size:11px;">
      MekaSoft — Logiciel de gestion pour garages. Ceci est un email automatique, merci de ne pas y répondre.
    </div>
  </div>
</div>`;
}

/** A brand-primary CTA button, inline-styled (used by the team-invite email). */
export function brandButton(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:${COLORS.primary};color:${COLORS.primaryForeground};text-decoration:none;padding:10px 22px;border-radius:6px;font-weight:bold;font-size:14px;">${label}</a>`;
}
