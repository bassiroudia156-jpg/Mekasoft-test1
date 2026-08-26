'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import Icon from './Icon';

export interface RowMenuItem {
  key: string;
  label: string;
  icon: string;
  onClick: () => void;
  tone?: 'destructive';
  /** Renders a divider above this item (e.g. before a destructive action). */
  separatorBefore?: boolean;
}

export interface RowMenuProps {
  items: RowMenuItem[];
  ariaLabel?: string;
  iconSize?: number;
  width?: number;
}

// 2026-08-18 fix: every row "..." menu in the app (invoices, vehicles,
// payments) was `absolute`-positioned relative to a row sitting inside a
// `overflow-x-auto` table wrapper. Per the CSS overflow spec, setting only
// overflow-x to a non-visible value forces the paired overflow-y to
// compute to 'auto' too — so the open panel (which extends past the row)
// got clipped by that same wrapper, which then grew its own scrollbar
// (complete with the OS's up/down arrow buttons) instead of showing the
// menu. No amount of z-index fixes that; the panel has to escape the
// clipping ancestor entirely. This portals it to `document.body` and
// positions it with `getBoundingClientRect()` off the trigger button,
// closing on any scroll/resize so a stale position never lingers.
//
// InvoiceRowMenu's original comment noted a second concrete use case
// would justify extracting a shared primitive — this is now the third,
// and the bug fix needed one central place to land in.
export default function RowMenu({
  items,
  ariaLabel = "Plus d'options",
  iconSize = 16,
  width = 224,
}: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function reposition() {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      setStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
        width,
      });
    }
    reposition();

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleDismiss() {
      setOpen(false);
    }

    document.addEventListener('mousedown', handleClick);
    // capture: true — catches scroll on any ancestor (e.g. the table's
    // own horizontal scroll container), not just window-level scroll.
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [open, width]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/10"
      >
        <Icon i="ellipsis" size={iconSize} />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={style}
            className="z-50 bg-surface border border-border rounded-md shadow-lg overflow-hidden py-1"
          >
            {items.map((item) => (
              <div key={item.key}>
                {item.separatorBefore && <div className="my-1 border-t border-border" />}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => run(item.onClick)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left hover:bg-input',
                    item.tone === 'destructive'
                      ? 'text-destructive hover:bg-destructive/5'
                      : 'text-foreground',
                  )}
                >
                  <Icon
                    i={item.icon}
                    size={14}
                    className={item.tone === 'destructive' ? undefined : 'text-muted-foreground'}
                  />
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
