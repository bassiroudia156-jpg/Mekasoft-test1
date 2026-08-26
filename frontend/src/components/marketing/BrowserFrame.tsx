import { type ReactNode } from 'react';

// "Spectacular" framing device for the landing page's two product mockups
// (2026-08-18 request). A browser-chrome bar (traffic lights only — the
// fake address-bar text was dropped per explicit follow-up feedback, the
// user disliked it) around real, detailed recreations of the actual
// MekaSoft screens reads as a genuine product screenshot without an
// external image asset — see DashboardPreview.tsx / ClientProfilePreview.tsx
// for why no real image file is possible here. The soft color glow + slight
// tilt + hover lift is the polish the user asked for on top of the content.
export default function BrowserFrame({
  children,
  float = false,
}: {
  children: ReactNode;
  /** Continuous subtle bob — reserved for the hero placement so the page
   * doesn't feel busy with two independently-floating elements at once. */
  float?: boolean;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-6 lg:-inset-10 bg-gradient-to-br from-primary/25 via-accent/10 to-transparent blur-3xl rounded-[2.5rem] -z-10"
      />
      <div
        className={`rounded-xl lg:rounded-2xl border border-border shadow-2xl overflow-hidden bg-surface transition-transform duration-500 ease-out -rotate-1 hover:rotate-0 hover:-translate-y-1 ${
          float ? 'animate-float' : ''
        }`}
      >
        <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/50 border-b border-border">
          <span className="w-2 h-2 rounded-full bg-destructive/50" />
          <span className="w-2 h-2 rounded-full bg-warning/50" />
          <span className="w-2 h-2 rounded-full bg-success/50" />
        </div>
        {children}
      </div>
    </div>
  );
}
