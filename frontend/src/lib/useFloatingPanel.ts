'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

export interface UseFloatingPanelOptions {
  /** Whether the panel is currently shown. */
  open: boolean;
  /** Called to close the panel (outside click, scroll, resize). */
  onClose: () => void;
  /** Which edge of the trigger the panel aligns to horizontally. */
  align?: 'left' | 'right';
  /** Match the panel's width to the trigger's width (search combos). Off for fixed-width menus. */
  matchWidth?: boolean;
  /** Gap in px between the trigger and the panel. */
  gap?: number;
}

/**
 * Shared "floating panel" positioning for custom dropdowns (search combos,
 * menus, pickers). Mirrors the fix already applied to RowMenu and
 * DatePicker (2026-08-18): an `absolute`-positioned panel inherits its
 * nearest positioned/overflow ancestor as a clipping + stacking context, so
 * any card with `overflow-hidden` or a table with `overflow-x-auto` cuts
 * the panel off or buries it under later-painted siblings — no z-index
 * fixes that, the panel has to escape the ancestor entirely. This hook
 * portals the panel to `document.body` (caller does the actual
 * `createPortal` call) and computes `position: fixed` coordinates from the
 * trigger's `getBoundingClientRect()`, closing on any scroll/resize so a
 * stale position never lingers on screen.
 */
export function useFloatingPanel<Trigger extends HTMLElement = HTMLElement>({
  open,
  onClose,
  align = 'left',
  matchWidth = false,
  gap = 4,
}: UseFloatingPanelOptions) {
  const triggerRef = useRef<Trigger>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!open) return;

    function reposition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setStyle({
        position: 'fixed',
        top: rect.bottom + gap,
        ...(align === 'right' ? { right: window.innerWidth - rect.right } : { left: rect.left }),
        ...(matchWidth ? { width: rect.width } : {}),
      });
    }
    reposition();

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onClose();
    }
    // capture: true — catches scroll on any ancestor (e.g. a table's own
    // horizontal scroll container), not just window-level scroll.
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
    // `onClose` intentionally excluded from deps — callers pass either a
    // stable setter (setOpen(false)) or an inline closure that's fine to
    // rebind silently; re-running this effect on identity change alone
    // would just re-attach the same listeners.
  }, [open, align, matchWidth, gap]);

  return { triggerRef, panelRef, style };
}
