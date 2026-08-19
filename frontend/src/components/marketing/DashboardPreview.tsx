import Icon from '../ui/Icon';
import BrowserFrame from './BrowserFrame';

// Recreates the actual Banani "Dashboard — MekaSoft" screen (fetched via the
// Banani MCP, screens/Dashboard.jsx + its Sidebar/TopBar/StatCard/
// RevenueChart/InterventionRow sub-components) for the landing-page hero —
// user asked for "le dashboard sélectionné sur banani" specifically, not a
// generic mockup. Banani's own export has no real image asset behind it
// (its `<Image prompt="...">` slots are the editor's AI-image placeholder,
// confirmed by re-fetching the selection — no URL/file exists), so this is
// a faithful, hand-built recreation instead: same sidebar nav order, same
// KPI labels/values, same revenue-chart day bars, same sample client names
// and intervention rows as the real fetched source — not invented content.
const NAV = [
  { id: 'dashboard', icon: 'layout-dashboard', label: 'Tableau de bord' },
  { id: 'interventions', icon: 'wrench', label: 'Interventions' },
  { id: 'clients', icon: 'users', label: 'Clients' },
  { id: 'vehicles', icon: 'car', label: 'Véhicules' },
  { id: 'invoices', icon: 'file-text', label: 'Factures' },
  { id: 'payments', icon: 'banknote', label: 'Paiements' },
];

const STATS: { label: string; value: string; icon: string; bar: string }[] = [
  { label: 'En cours', value: '7', icon: 'wrench', bar: 'bg-warning' },
  { label: 'Non payé', value: '3', icon: 'banknote', bar: 'bg-accent' },
  { label: 'Terminé ce mois', value: '41', icon: 'circle-check', bar: 'bg-success' },
  { label: 'Recettes du mois', value: '2,4M', icon: 'trending-up', bar: 'bg-primary' },
];

const CHART_BARS = [
  { day: 'Lun', value: 60 },
  { day: 'Mar', value: 85 },
  { day: 'Mer', value: 45 },
  { day: 'Jeu', value: 100 },
  { day: 'Ven', value: 75 },
  { day: 'Sam', value: 90 },
  { day: 'Dim', value: 30 },
];

const ROWS: {
  client: string;
  vehicle: string;
  status: 'En cours' | 'Non payé' | 'Terminé';
  amount: string;
}[] = [
  { client: 'Ibrahima Sow', vehicle: 'Toyota Hilux', status: 'En cours', amount: '45K' },
  { client: 'Fatou Ndiaye', vehicle: 'Renault Clio', status: 'Non payé', amount: '62K' },
  { client: 'Boubacar Traoré', vehicle: 'Mercedes Sprinter', status: 'Terminé', amount: '90K' },
];

const STATUS_STYLES: Record<string, string> = {
  'En cours': 'bg-warning/10 text-warning',
  'Non payé': 'bg-accent/10 text-accent',
  Terminé: 'bg-success/10 text-success',
};

export default function DashboardPreview() {
  return (
    <BrowserFrame float>
      <div className="flex h-64 lg:h-[340px]">
        {/* sidebar */}
        <div className="w-12 lg:w-16 bg-primary flex flex-col items-center gap-2 lg:gap-2.5 py-2.5 lg:py-3.5 shrink-0">
          <div className="w-5 h-5 lg:w-6 lg:h-6 rounded-sm bg-accent flex items-center justify-center mb-1 lg:mb-2">
            <Icon
              i="wrench"
              size={11}
              className="text-accent-foreground w-2.5 h-2.5 lg:w-3 lg:h-3"
            />
          </div>
          {NAV.map((item) => (
            <div
              key={item.id}
              className={`w-6 h-6 lg:w-7 lg:h-7 rounded-sm flex items-center justify-center ${
                item.id === 'dashboard' ? 'bg-primary-foreground/15' : ''
              }`}
            >
              <Icon
                i={item.icon}
                size={12}
                className={`w-3 h-3 lg:w-3.5 lg:h-3.5 ${
                  item.id === 'dashboard' ? 'text-primary-foreground' : 'text-primary-foreground/45'
                }`}
              />
            </div>
          ))}
        </div>

        {/* main */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* topbar */}
          <div className="flex items-center justify-between gap-2 px-2.5 lg:px-4 py-2 lg:py-2.5 border-b border-border bg-surface shrink-0">
            <div className="min-w-0">
              <div className="text-[6px] lg:text-[7px] text-muted-foreground uppercase tracking-widest truncate">
                Vendredi 16 mai
              </div>
              <div className="text-[9px] lg:text-[11px] font-bold font-headings text-foreground leading-tight">
                Tableau de bord
              </div>
            </div>
            <div className="hidden lg:flex items-center gap-1 border border-border rounded-sm px-2 py-1 bg-input text-muted-foreground shrink-0">
              <Icon i="search" size={9} />
              <span className="text-[7px]">Chercher…</span>
            </div>
            <div className="flex items-center gap-1 bg-accent text-accent-foreground px-1.5 lg:px-2 py-1 rounded-sm shrink-0">
              <Icon i="plus" size={9} className="w-2 h-2 lg:w-2.5 lg:h-2.5" />
              <span className="hidden lg:inline text-[7px] font-medium">Nouvelle intervention</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-1.5 lg:gap-2.5 p-2 lg:p-3.5 overflow-hidden">
            {/* KPI row */}
            <div className="grid grid-cols-4 gap-1 lg:gap-2">
              {STATS.map((s) => (
                <div
                  key={s.label}
                  className="bg-surface border border-border rounded-sm p-1 lg:p-2 flex flex-col gap-0.5 lg:gap-1"
                >
                  <div className="flex items-center justify-between">
                    <Icon
                      i={s.icon}
                      size={8}
                      className="text-muted-foreground w-2 h-2 lg:w-2.5 lg:h-2.5"
                    />
                    <span className={`w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full ${s.bar}`} />
                  </div>
                  <div className="text-[9px] lg:text-[13px] font-bold font-headings text-foreground leading-none">
                    {s.value}
                  </div>
                  <div className="hidden lg:block text-[6px] text-muted-foreground truncate leading-none">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* revenue chart */}
            <div className="bg-surface border border-border rounded-sm p-1.5 lg:p-2.5 flex flex-col gap-1 lg:gap-1.5">
              <div className="flex items-center justify-between">
                <div className="text-[6px] lg:text-[8px] font-bold font-headings text-foreground">
                  970 000 FCFA
                </div>
                <div className="hidden lg:flex items-center gap-0.5 text-success text-[6px] font-medium bg-success/10 px-1 py-0.5 rounded-sm">
                  <Icon i="trending-up" size={7} />
                  +18%
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-6 lg:h-9">
                {CHART_BARS.map((b) => (
                  <div
                    key={b.day}
                    className="flex-1 rounded-[1px] bg-primary/15 flex items-end h-full"
                  >
                    <div
                      className="w-full rounded-[1px] bg-primary"
                      style={{ height: `${b.value}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* intervention rows */}
            <div className="flex-1 bg-surface border border-border rounded-sm overflow-hidden flex flex-col">
              {ROWS.map((r) => (
                <div
                  key={r.client}
                  className="flex items-center gap-1 lg:gap-1.5 px-1.5 lg:px-2.5 py-1 lg:py-1.5 border-b border-border last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[6px] lg:text-[8px] font-medium text-foreground truncate">
                      {r.client}
                    </div>
                    <div className="hidden lg:block text-[6px] text-muted-foreground truncate">
                      {r.vehicle}
                    </div>
                  </div>
                  <span
                    className={`text-[5px] lg:text-[6px] font-medium px-1 py-0.5 rounded-sm shrink-0 ${STATUS_STYLES[r.status]}`}
                  >
                    {r.status}
                  </span>
                  <span className="text-[6px] lg:text-[8px] font-bold text-foreground shrink-0 w-6 lg:w-7 text-right">
                    {r.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}
