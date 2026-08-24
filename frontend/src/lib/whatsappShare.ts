'use client';

// PRD requirement (planning_prd-mekasoft §4.6/4.7, "Partage WhatsApp"): a
// button that "ouvre le partage natif du navigateur" so the garage can hand
// a devis/facture PDF straight into the client's WhatsApp chat. A `wa.me`
// text-only stopgap used to live on the invoice page and was deliberately
// pulled (see lib/server/plans/limits.ts's 2026-08-20 comment) — that
// removal was about not advertising a half-built share as a paid-plan
// differentiator, and about a *separate*, bigger feature the team is
// planning: an actual server-side WhatsApp send via the Twilio client
// already wired for subscription-renewal reminders
// (lib/server/subscriptions/whatsapp.ts). This helper is NOT that — no
// message is ever sent server-side, nothing leaves the browser on its own.
// It's exactly what the PRD describes: the browser's own share sheet, which
// the user still has to confirm — the same as tapping any app's share icon.
//
// 2026-08-24 re-added, scoped to the invoice page only (a real PDF blob is
// available at GET /api/invoices/[id]/pdf). The devis page has no
// server-rendered PDF — it's `window.print()`-only (see its own header
// comment) — so it can't offer a file attachment the same way; wiring devis
// sharing would mean building a devis PDF route first, out of scope here.
export type WhatsAppShareResult = 'shared' | 'fallback' | 'cancelled' | 'error';

/**
 * Fetches an already-authenticated PDF, then either hands it to the OS
 * share sheet as a real attachment (Web Share API with files — supported on
 * Android Chrome, the device class the PRD's personas actually use), or
 * falls back to opening the PDF in a new tab plus a `wa.me` chat with the
 * message pre-filled, for browsers without file-sharing support (desktop,
 * Safari). The fallback can't attach the file itself — `wa.me` is a
 * text-only deep link, a WhatsApp API limitation, not something this code
 * can work around — so the user attaches the just-opened PDF manually.
 */
export async function sharePdfViaWhatsApp(opts: {
  pdfUrl: string;
  filename: string;
  /** Client's phone number, any format — digits are extracted for wa.me. */
  phone: string | null;
  text: string;
}): Promise<WhatsAppShareResult> {
  const { pdfUrl, filename, phone, text } = opts;

  let file: File | null = null;
  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
    const blob = await res.blob();
    file = new File([blob], filename, { type: 'application/pdf' });
  } catch {
    // Couldn't even fetch the PDF — nothing to share, nothing to fall back
    // to either (opening pdfUrl again would just hit the same failure).
    return 'error';
  }

  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      // AbortError = user closed the native share sheet without picking an
      // app — a deliberate cancel, not a failure worth toasting as one.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Any other failure (e.g. a share target rejecting the file) still
      // has the fallback available below.
    }
  }

  window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  const digits = phone ? phone.replace(/\D/g, '') : '';
  const waUrl = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank', 'noopener,noreferrer');
  return 'fallback';
}
