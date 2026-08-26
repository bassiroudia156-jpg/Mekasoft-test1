import { type ReactNode } from 'react';
import Icon from './Icon';
import { useMobileSidebar } from '@/contexts/MobileSidebarContext';

export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}

// ClientsList/VehiclesList/AddNewClient/AddVehicle all render their own
// header instead of the shared TopBar (no TopBar import in any of those
// Banani screens) — eyebrow label + title + a right-side action slot
// (button on list pages, "Retour" link on form pages).
//
// Responsive audit fix (2026-08-17): gained the same `lg:hidden` hamburger
// as TopBar — this is the header every Sidebar-using page besides the
// dashboard renders, so it's the other half of making Sidebar reachable
// below `lg:`.
export default function PageHeader({ eyebrow, title, action }: PageHeaderProps) {
  const { toggle } = useMobileSidebar();

  return (
    <div className="bg-surface border-b border-border px-4 py-4 lg:px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={toggle}
          aria-label="Ouvrir le menu"
          className="lg:hidden w-11 h-11 flex items-center justify-center rounded-sm border border-border text-foreground shrink-0"
        >
          <Icon i="menu" size={18} />
        </button>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-widest">{eyebrow}</div>
          <div className="text-lg font-bold font-headings text-foreground truncate">{title}</div>
        </div>
      </div>
      {action}
    </div>
  );
}
