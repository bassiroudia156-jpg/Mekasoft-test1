import type { ReactNode } from 'react';
import Icon from '@/components/ui/Icon';
import Button from '@/components/ui/Button';
import { useMobileSidebar } from '@/contexts/MobileSidebarContext';

export interface TopBarProps {
  /** Greeting/context line — Banani mocked "Tableau de bord" as a static label; kept as a prop so each page can set its own. */
  title?: string;
  onNewIntervention?: () => void;
  /** Rendered in the slot that used to hold the free-text search box (right
   * of "Nouvelle intervention", wraps to its own full-width row on mobile).
   * 2026-08-19: the dashboard's search input was retired in favor of this —
   * see ExportMenu, its current occupant — since TopBar has no other
   * consumer today, the slot stayed generic rather than hardcoding Export
   * here. */
  rightSlot?: ReactNode;
}

function todayFr(): string {
  return new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Responsive audit fix (2026-08-17): the search box (now `rightSlot`, see
// its prop comment) was a fixed w-64 (256px) with no mobile treatment, and
// there was no way to reach `Sidebar` at all below `lg:` before this pass
// added the hamburger. Below `lg:` that slot still wraps to its own
// full-width row (`order-last` + `w-full`) and the CTA label shortens,
// rather than everything overflowing the viewport.
export default function TopBar({
  title = 'Tableau de bord',
  onNewIntervention,
  rightSlot,
}: TopBarProps) {
  const { toggle } = useMobileSidebar();

  return (
    <div className="bg-surface border-b border-border px-4 py-3 lg:px-6 flex flex-wrap items-center gap-3 lg:gap-4">
      <button
        type="button"
        onClick={toggle}
        aria-label="Ouvrir le menu"
        className="lg:hidden w-11 h-11 flex items-center justify-center rounded-sm border border-border text-foreground shrink-0"
      >
        <Icon i="menu" size={18} />
      </button>

      {/* Date & greeting */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground uppercase tracking-widest hidden sm:block">
          {todayFr()}
        </div>
        <div className="text-lg font-bold font-headings text-foreground leading-tight truncate">
          {title}
        </div>
      </div>

      {/* New intervention CTA */}
      <Button variant="accent" size="md" onClick={onNewIntervention} className="shrink-0">
        <Icon i="plus" size={14} />
        <span className="hidden sm:inline">Nouvelle intervention</span>
        <span className="sm:hidden">Nouvelle</span>
      </Button>

      {rightSlot && <div className="w-full lg:w-auto order-last lg:order-none">{rightSlot}</div>}
    </div>
  );
}
