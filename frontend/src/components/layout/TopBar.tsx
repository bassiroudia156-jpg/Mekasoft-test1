import Icon from '@/components/ui/Icon';
import Button from '@/components/ui/Button';
import { useMobileSidebar } from '@/contexts/MobileSidebarContext';

export interface TopBarProps {
  /** Greeting/context line — Banani mocked "Tableau de bord" as a static label; kept as a prop so each page can set its own. */
  title?: string;
  searchPlaceholder?: string;
  /** Controlled search input — Banani's mock rendered this as decorative text with no real
   * `<input>` behind it; the caller now owns the value and drives its own filtering. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onNewIntervention?: () => void;
}

function todayFr(): string {
  return new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Responsive audit fix (2026-08-17): the search box was a fixed w-64
// (256px) with no mobile treatment, and there was no way to reach `Sidebar`
// at all below `lg:` before this pass added the hamburger. Below `lg:` the
// search now wraps to its own full-width row (`order-last` + `w-full`) and
// the CTA label shortens, rather than everything overflowing the viewport.
export default function TopBar({
  title = 'Tableau de bord',
  searchPlaceholder = 'Chercher client, véhicule…',
  searchValue = '',
  onSearchChange,
  onNewIntervention,
}: TopBarProps) {
  const { toggle } = useMobileSidebar();

  return (
    <div className="bg-surface border-b border-border px-4 py-3 lg:px-6 flex flex-wrap items-center gap-3 lg:gap-4">
      <button
        type="button"
        onClick={toggle}
        aria-label="Ouvrir le menu"
        className="lg:hidden w-9 h-9 flex items-center justify-center rounded-sm border border-border text-foreground shrink-0"
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

      {/* Search */}
      <div className="relative w-full lg:w-64 order-last lg:order-none">
        <Icon
          i="search"
          size={14}
          className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
        />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-3 py-2 border border-border bg-input rounded-sm text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
    </div>
  );
}
