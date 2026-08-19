'use client';

import { useEffect, useRef } from 'react';

// Audit request (2026-08-18): "je veux que la recuperation de donnees se
// fasse en temps reel apres les creations" — this app has no shared
// client-side cache (react-query/SWR) or push channel, so a list page left
// open in one tab has no way to know another tab/flow just created a row.
// Vercel's serverless model rules out the cheap in-process fix too (no
// long-lived server to push from — see CLAUDE.md's Ably guidance for a
// genuine push-based solution if that's ever needed). Refetch-on-focus is
// the standard, near-zero-cost complement: silently re-fetch whenever the
// tab/window regains focus or becomes visible again, so switching back to
// an already-open list shows what actually changed while it was away.
//
// Stores the latest callback in a ref so callers don't need to `useCallback`
// their fetch function — the listener is attached once (empty deps) and
// always invokes whatever `onFocus` currently is.
export function useRefetchOnFocus(onFocus: () => void): void {
  const callbackRef = useRef(onFocus);
  callbackRef.current = onFocus;

  useEffect(() => {
    function handle() {
      if (document.visibilityState === 'visible') callbackRef.current();
    }
    window.addEventListener('focus', handle);
    document.addEventListener('visibilitychange', handle);
    return () => {
      window.removeEventListener('focus', handle);
      document.removeEventListener('visibilitychange', handle);
    };
  }, []);
}
