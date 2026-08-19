import BrandIcon from '@/components/ui/BrandIcon';

// Shared left-side branding panel across every auth screen (login, signup,
// verify-email, reset-password). Banani only designed this for desktop
// (LoginWithRecovery_next1) — the flow has no mobile auth mockup, so the
// compact top-bar variant below is our own mobile-first addition, not a
// Banani screen. Bundling both into one component keeps every auth page's
// composition to a single <AuthBrandPanel /> call.
// The stats strip (2400+ ateliers / 98% satisfaction / 24/7 support) that
// used to sit at the bottom of the desktop panel was removed 2026-08-18 per
// explicit user feedback (screenshot of this exact block, "je veux que tu
// m'enlève ceci") — fabricated numbers with no real data behind them.

export default function AuthBrandPanel() {
  return (
    <>
      {/* Mobile (< lg): compact top bar — Banani has no mobile mockup for
          this flow, so this is our own responsive addition, not a fetched
          screen. Full hero copy/stats would overwhelm a 375px viewport. */}
      <div className="flex lg:hidden items-center gap-3 bg-primary px-5 py-4">
        <BrandIcon size={36} className="rounded-lg shrink-0" />
        <div>
          <div className="text-primary-foreground font-headings font-bold text-lg leading-tight">
            MekaSoft
          </div>
          <div className="text-primary-foreground/60 text-xs uppercase tracking-widest">
            Gestion d&apos;atelier
          </div>
        </div>
      </div>

      {/* Desktop (lg+): full hero panel, ported from LoginWithRecovery_next1 */}
      <div className="hidden lg:flex flex-col w-1/2 bg-primary p-16 relative overflow-hidden shrink-0">
        <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(45deg,transparent,transparent_35px,rgba(255,255,255,0.1)_35px,rgba(255,255,255,0.1)_70px)]" />

        <div className="flex items-center gap-3 mb-auto relative z-10">
          <BrandIcon size={48} className="rounded-lg shrink-0" />
          <div>
            <div className="text-primary-foreground font-headings font-bold text-2xl tracking-tight">
              MekaSoft
            </div>
            <div className="text-primary-foreground/60 text-xs uppercase tracking-widest">
              Gestion d&apos;atelier
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-auto mb-auto">
          <div className="w-12 h-1 bg-primary-foreground mb-8" />
          <h1 className="text-primary-foreground font-headings font-bold text-5xl leading-tight mb-6">
            Votre atelier.
            <br />
            <span className="text-primary-foreground opacity-80">Sous contrôle.</span>
          </h1>
          <p className="text-primary-foreground/60 text-lg leading-relaxed max-w-lg">
            Interventions, clients, facturation — tout au même endroit. Une solution complète pour
            gérer votre atelier en toute efficacité.
          </p>
        </div>
      </div>
    </>
  );
}
