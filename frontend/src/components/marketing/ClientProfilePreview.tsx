import Icon from '../ui/Icon';
import BrowserFrame from './BrowserFrame';

// Recreates the actual Banani "Client Profile — Ibrahima Sow" screen
// (fetched via the Banani MCP, screens/ClientProfileIbrahima.jsx + its
// Sidebar/VehicleRow sub-components) for the landing page's "tableau de
// bord" product-showcase section — user asked for "l'image client profil
// que j'ai sélectionné sur banani" specifically. Same reasoning as
// DashboardPreview: Banani's own `<Image prompt="...">` slots have no real
// asset behind them, so this is a faithful hand-built recreation of the
// real fetched screen's copy/layout instead — same client name, same
// vehicles, same intervention history rows as the actual Banani source.
const VEHICLES = [
  { label: 'Toyota Hilux', reg: 'DK-4821-A' },
  { label: 'BMW 320i', reg: 'DK-3342-K' },
];

const HISTORY = [
  { id: 'INT-038', work: 'Courroie de distribution', amount: '120K' },
  { id: 'INT-032', work: 'Vidange + filtre à huile', amount: '45K' },
  { id: 'INT-025', work: 'Plaquettes frein AV', amount: '62K' },
];

export default function ClientProfilePreview() {
  return (
    <BrowserFrame>
      <div className="flex h-64 lg:h-[340px]">
        {/* sidebar (clients active) */}
        <div className="w-12 lg:w-16 bg-primary flex flex-col items-center gap-2 lg:gap-2.5 py-2.5 lg:py-3.5 shrink-0">
          <div className="w-5 h-5 lg:w-6 lg:h-6 rounded-sm bg-accent flex items-center justify-center mb-1 lg:mb-2">
            <Icon
              i="wrench"
              size={11}
              className="text-accent-foreground w-2.5 h-2.5 lg:w-3 lg:h-3"
            />
          </div>
          {['layout-dashboard', 'wrench', 'users', 'car', 'file-text', 'banknote'].map((icon) => (
            <div
              key={icon}
              className={`w-6 h-6 lg:w-7 lg:h-7 rounded-sm flex items-center justify-center ${
                icon === 'users' ? 'bg-primary-foreground/15' : ''
              }`}
            >
              <Icon
                i={icon}
                size={12}
                className={`w-3 h-3 lg:w-3.5 lg:h-3.5 ${
                  icon === 'users' ? 'text-primary-foreground' : 'text-primary-foreground/45'
                }`}
              />
            </div>
          ))}
        </div>

        {/* main */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* header */}
          <div className="flex items-center justify-between gap-2 px-2.5 lg:px-4 py-2 lg:py-2.5 border-b border-border bg-surface shrink-0">
            <div className="flex items-center gap-1 min-w-0">
              <Icon i="chevron-left" size={9} className="text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-[6px] lg:text-[7px] text-muted-foreground uppercase tracking-widest truncate">
                  Fiche client
                </div>
                <div className="text-[9px] lg:text-[11px] font-bold font-headings text-foreground leading-tight truncate">
                  Ibrahima Sow
                </div>
              </div>
            </div>
            <div className="hidden lg:flex items-center gap-1 bg-primary text-primary-foreground px-2 py-1 rounded-sm shrink-0">
              <Icon i="wrench" size={9} className="w-2.5 h-2.5" />
              <span className="text-[7px] font-medium">Nouvelle intervention</span>
            </div>
          </div>

          <div className="flex-1 flex gap-1.5 lg:gap-2.5 p-2 lg:p-3.5 overflow-hidden min-h-0">
            {/* left column */}
            <div className="w-16 lg:w-24 flex flex-col gap-1.5 lg:gap-2 shrink-0">
              <div className="bg-surface border border-border rounded-sm p-1.5 lg:p-2 flex flex-col items-center gap-1 text-center">
                <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-full bg-secondary flex items-center justify-center text-[7px] lg:text-[9px] font-bold text-primary">
                  IS
                </div>
                <div className="text-[6px] lg:text-[7px] font-bold text-foreground truncate w-full">
                  Ibrahima Sow
                </div>
                <div className="w-full flex items-center justify-center gap-1 px-1 py-0.5 rounded-sm bg-success/10">
                  <span className="w-1 h-1 rounded-full bg-success" />
                  <span className="text-[5px] lg:text-[6px] font-medium text-success">Actif</span>
                </div>
              </div>
              <div className="hidden lg:flex bg-surface border border-border rounded-sm p-2 flex-col gap-1.5">
                <div className="text-[6px] font-medium uppercase tracking-widest text-muted-foreground">
                  Statistiques
                </div>
                <div className="bg-background rounded-sm p-1.5">
                  <div className="text-[6px] text-muted-foreground">Interventions</div>
                  <div className="text-[10px] font-bold text-foreground">14</div>
                </div>
                <div className="bg-background rounded-sm p-1.5">
                  <div className="text-[6px] text-muted-foreground">Total dépensé</div>
                  <div className="text-[8px] font-bold text-foreground">450K FCFA</div>
                </div>
              </div>
            </div>

            {/* right column */}
            <div className="flex-1 flex flex-col gap-1.5 lg:gap-2.5 min-w-0">
              <div className="bg-surface border border-border rounded-sm overflow-hidden">
                <div className="px-1.5 lg:px-2.5 py-1 lg:py-1.5 border-b border-border text-[6px] lg:text-[7px] font-medium uppercase tracking-widest text-muted-foreground">
                  Véhicules enregistrés
                </div>
                {VEHICLES.map((v) => (
                  <div
                    key={v.reg}
                    className="flex items-center justify-between gap-1 px-1.5 lg:px-2.5 py-1 lg:py-1.5 border-b border-border last:border-b-0"
                  >
                    <span className="text-[6px] lg:text-[8px] font-medium text-foreground truncate">
                      {v.label}
                    </span>
                    <span className="text-[5px] lg:text-[6px] text-muted-foreground shrink-0">
                      {v.reg}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex-1 bg-surface border border-border rounded-sm overflow-hidden flex flex-col min-h-0">
                <div className="px-1.5 lg:px-2.5 py-1 lg:py-1.5 border-b border-border text-[6px] lg:text-[7px] font-medium uppercase tracking-widest text-muted-foreground shrink-0">
                  Historique des interventions
                </div>
                {HISTORY.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center gap-1 px-1.5 lg:px-2.5 py-1 lg:py-1.5 border-b border-border last:border-b-0"
                  >
                    <span className="flex-1 text-[6px] lg:text-[8px] text-foreground truncate">
                      {h.work}
                    </span>
                    <span className="text-[5px] lg:text-[6px] font-medium px-1 py-0.5 rounded-sm bg-success/10 text-success shrink-0">
                      Terminé
                    </span>
                    <span className="text-[6px] lg:text-[8px] font-bold text-foreground shrink-0 w-5 lg:w-6 text-right">
                      {h.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}
