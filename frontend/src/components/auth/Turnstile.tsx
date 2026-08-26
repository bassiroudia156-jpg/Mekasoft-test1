// Cloudflare Turnstile widget — security audit fix (2026-08-24, control #12:
// no anti-bot protection existed on public forms). See
// lib/server/security/turnstile.ts for the server-side verification this
// pairs with.
//
// Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY isn't set, so signup
// keeps working exactly as before on any fork that hasn't configured
// Turnstile — same "optional provider, inert without its key" philosophy as
// the rest of this starter (Cloudinary, Resend, Bictorys…).
'use client';

import { useEffect, useRef, useState } from 'react';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback'?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export default function Turnstile({ onVerify }: { onVerify: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // Load the Cloudflare script once (shared across any number of mounted
  // widgets — Turnstile's own script is idempotent about re-injection).
  useEffect(() => {
    if (!SITE_KEY) return;
    if (window.turnstile) {
      setScriptLoaded(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => setScriptLoaded(true));
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Render the widget once the script is ready, clean up on unmount.
  useEffect(() => {
    if (!SITE_KEY || !scriptLoaded || !containerRef.current || !window.turnstile) return;
    const turnstile = window.turnstile;
    const id = turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: onVerify,
      'expired-callback': () => onVerify(''),
    });
    widgetIdRef.current = id;
    return () => {
      turnstile.remove(id);
    };
    // Deliberately depends only on scriptLoaded, not onVerify — this project's
    // ESLint config doesn't register react-hooks/exhaustive-deps (see
    // app/subscriptions/return/page.tsx for the same pattern), and re-running
    // this effect on every onVerify identity change would tear down and
    // re-render the live Turnstile widget on each parent re-render.
  }, [scriptLoaded]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
