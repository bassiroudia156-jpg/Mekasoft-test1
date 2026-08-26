'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface MobileSidebarContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

// Below `lg:`, `Sidebar` renders as an off-canvas panel instead of its
// normal static column — this holds that open/closed state at the root so
// the hamburger button (rendered inside `TopBar`/`PageHeader`, siblings of
// `Sidebar`, not ancestors) can toggle it without prop-drilling through
// each of the 18 authenticated pages that compose these three components
// independently. Always has a real value (default, not null) — this is
// pure UI state with no async/SSR concern, unlike AuthContext's user data,
// so there's nothing to throw on a missing provider for.
const MobileSidebarContext = createContext<MobileSidebarContextValue>({
  open: false,
  toggle: () => {},
  close: () => {},
});

export function MobileSidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MobileSidebarContext.Provider
      value={{ open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) }}
    >
      {children}
    </MobileSidebarContext.Provider>
  );
}

export function useMobileSidebar(): MobileSidebarContextValue {
  return useContext(MobileSidebarContext);
}
