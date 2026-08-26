'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import Icon from './Icon';

export interface DatePickerProps {
  label?: string;
  name: string;
  /** ISO 'YYYY-MM-DD', or '' when unset. Same shape every date Field in the
   * app already passes around (dashboard filters, payment/cheque dates). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** ISO lower/upper bound (inclusive) — e.g. clamping "Au" to not precede
   * "Du" on the dashboard's date-range filter. `| undefined` (not just `?`)
   * so callers can wire `dateFrom || undefined` straight through under
   * exactOptionalPropertyTypes (see AnimatedNumber's `format` for the same
   * pattern). */
  min?: string | undefined;
  max?: string | undefined;
  labelExtra?: ReactNode;
  className?: string;
}

const WEEKDAYS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const PANEL_WIDTH = 272;
// Rough rendered height of the panel below (header + weekday row + 6 grid
// rows + footer, all at their fixed Tailwind sizes) — used to decide
// whether it fits below the trigger before flipping above it.
const PANEL_HEIGHT = 360;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Rejects malformed input and out-of-range overflow (e.g. "2026-02-30"
// silently rolling into March) rather than trusting whatever the caller's
// state happens to hold.
function parseIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(year, month, day);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
  return d;
}

function formatDisplay(s: string): string {
  const d = parseIso(s);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildGrid(viewDate: Date): { date: Date; inMonth: boolean }[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first, matching fr-FR convention.
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date, inMonth: date.getMonth() === month };
  });
}

// 2026-08-18 — "je veux que le calendrier sur le dashboard soit plus
// moderne... celui utilisé est trop classic" — replaces the native
// <input type="date"> (OS-chrome date picker) with a custom calendar that
// matches the rest of the design system. Lives as its own component (not
// inlined in Field.tsx) because it needs the same escape-the-clipping-
// ancestor portal technique as RowMenu.tsx — the dashboard's filter bar
// sits inside an `overflow-hidden` card, so an `absolute`-positioned panel
// would get clipped exactly like RowMenu's original bug.
export default function DatePicker({
  label,
  name,
  value,
  onChange,
  placeholder = 'jj/mm/aaaa',
  helper,
  error,
  required = false,
  disabled = false,
  min,
  max,
  labelExtra,
  className,
}: DatePickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = parseIso(value);
  const [viewDate, setViewDate] = useState(() => selected ?? startOfDay(new Date()));

  useEffect(() => {
    if (!open) return;
    // Re-seed the visible month from the current value each time the panel
    // opens — covers the case where `value` changed elsewhere (e.g. reset
    // filters) while the panel was closed.
    setViewDate(selected ?? startOfDay(new Date()));

    // 2026-08-21 fix: this only ever positioned the panel BELOW the
    // trigger, with no check for whether it actually fits there — a field
    // near the bottom of a scrollable container (e.g. the last field in
    // admin/promotions' "Nouveau code promo" modal) opened a panel that
    // ran off the bottom of the viewport with no way to reach the rest of
    // it (the panel is `position: fixed`, so the modal's own internal
    // scroll doesn't move it). Now it flips above the trigger when there
    // isn't room below but there is above, and otherwise clamps inside the
    // viewport so it's never fully unreachable.
    function reposition() {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(rect.width, PANEL_WIDTH);
      const overflowsRight = rect.left + width > window.innerWidth - 8;
      const fitsBelow = rect.bottom + PANEL_HEIGHT + 4 <= window.innerHeight - 8;
      const fitsAbove = rect.top - PANEL_HEIGHT - 4 >= 8;
      const top =
        fitsBelow || !fitsAbove
          ? Math.min(rect.bottom + 4, window.innerHeight - PANEL_HEIGHT - 8)
          : rect.top - PANEL_HEIGHT - 4;
      setStyle({
        position: 'fixed',
        top: Math.max(8, top),
        width,
        ...(overflowsRight
          ? { right: Math.max(8, window.innerWidth - rect.right) }
          : { left: rect.left }),
      });
    }
    reposition();

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function handleDismiss() {
      setOpen(false);
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    // capture: true — catches scroll on any ancestor, not just window-level.
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
    // Deliberately only `open` — `selected` is re-derived from `value` on
    // every render and only needs to seed the view once per open, not on
    // every keystroke-free re-render. This project's eslint config has no
    // react-hooks deps rule to satisfy either way.
  }, [open]);

  function isDisabledDate(d: Date): boolean {
    const iso = toIso(d);
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  }

  function selectDay(d: Date) {
    if (isDisabledDate(d)) return;
    onChange(toIso(d));
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    setViewDate((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  }

  const today = startOfDay(new Date());

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}
            {required && <span className="text-accent ml-1">*</span>}
          </label>
          {labelExtra}
        </div>
      )}

      <div className="relative">
        <button
          ref={btnRef}
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={clsx(
            'w-full flex items-center justify-between gap-2 border rounded-md px-3 py-2 text-sm bg-input text-left outline-none transition-colors focus:ring-2 focus:ring-primary/30',
            error ? 'border-warning' : 'border-border',
            disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/40',
            className,
          )}
        >
          <span
            className={clsx('truncate', selected ? 'text-foreground' : 'text-muted-foreground')}
          >
            {selected ? formatDisplay(value) : placeholder}
          </span>
          <Icon i="calendar" size={14} className="shrink-0 text-muted-foreground" />
        </button>

        {/* Real native date input, visually hidden but still rendered (not
            display:none) so it stays a candidate for the form's constraint
            validation — preserves `required` blocking a submit exactly like
            the native <input type="date"> it replaces (see payments/new's
            chequeDueDate, which has no other empty-value guard). */}
        {required && (
          <input
            type="date"
            name={name}
            value={value}
            required
            disabled={disabled}
            tabIndex={-1}
            aria-hidden="true"
            onChange={() => {}}
            className="sr-only"
          />
        )}
      </div>

      {error ? (
        <span className="text-xs text-warning">{error}</span>
      ) : helper ? (
        <span className="text-xs text-muted-foreground">{helper}</span>
      ) : null}

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Choisir une date"
            style={style}
            className="z-50 bg-surface border border-border rounded-lg shadow-lg p-3 animate-calendar-in"
          >
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Mois précédent"
                className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground transition-all duration-150 hover:bg-input hover:text-foreground active:scale-90"
              >
                <Icon i="chevron-left" size={14} />
              </button>
              <span className="text-sm font-medium text-foreground capitalize">
                {MONTH_YEAR.format(viewDate)}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Mois suivant"
                className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground transition-all duration-150 hover:bg-input hover:text-foreground active:scale-90"
              >
                <Icon i="chevron-right" size={14} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="h-7 flex items-center justify-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {buildGrid(viewDate).map(({ date, inMonth }) => {
                const iso = toIso(date);
                const isSelected = selected ? isSameDay(date, selected) : false;
                const isToday = isSameDay(date, today);
                const dayDisabled = isDisabledDate(date);
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={dayDisabled}
                    onClick={() => selectDay(date)}
                    className={clsx(
                      'h-8 w-8 rounded-md text-xs font-medium transition-all duration-150 active:scale-90',
                      !inMonth && 'text-muted-foreground/50',
                      inMonth && !isSelected && 'text-foreground hover:bg-input',
                      isSelected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                      isToday && !isSelected && 'ring-1 ring-primary/40',
                      dayDisabled && 'opacity-30 pointer-events-none',
                    )}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => selectDay(today)}
                className="text-xs font-medium text-primary hover:text-primary/80"
              >
                Aujourd&rsquo;hui
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Effacer
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
