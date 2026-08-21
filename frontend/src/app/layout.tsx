import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { MobileSidebarProvider } from '@/contexts/MobileSidebarContext';

// MekaSoft brand font (Banani design tokens specify IBM Plex Sans for both
// --font-body and --font-headings — see globals.css). Not a variable font in
// next/font/google, so explicit weights are required.
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

// SEO baseline (2026-08-20 pass) — set once here, inherited by every route
// unless it overrides a field. Only 3 routes actually need to (page.tsx,
// privacy/page.tsx, terms/page.tsx — the only Server Components in
// src/app/; see proxy.ts's header comment for why the ~35 client-
// component routes get their `noindex` from a response header instead of
// per-page metadata). `metadataBase` must be an absolute URL for Next to
// resolve every relative og:image/canonical below against it correctly —
// APP_URL is already the app's own canonical-origin env var (used
// server-side for webhook success/cancel URLs, see e.g.
// api/subscriptions/checkout/route.ts), reused here rather than
// introducing a second "what's my public URL" env var.
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const SITE_NAME = 'MekaSoft';
const DEFAULT_DESCRIPTION =
  'MekaSoft est le logiciel de gestion pour garages automobiles : clients, véhicules, réparations, devis, factures et paiements réunis au même endroit. Essai gratuit, sans carte bancaire.';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'MekaSoft — Logiciel de gestion pour garages automobiles',
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    'logiciel garage automobile',
    'gestion atelier mécanique',
    'logiciel de gestion garage',
    'facturation garage',
    'devis garage automobile',
    'logiciel garage Afrique',
  ],
  applicationName: SITE_NAME,
  // Blanket default so a future route never ships indexable by accident —
  // page.tsx/privacy/terms explicitly override this back to index:true,
  // everything else is already covered redundantly by proxy.ts's
  // X-Robots-Tag header (this is the metadata-level half of the same
  // belt-and-suspenders policy).
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: SITE_NAME,
    title: 'MekaSoft — Logiciel de gestion pour garages automobiles',
    description: DEFAULT_DESCRIPTION,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MekaSoft — Logiciel de gestion pour garages automobiles',
    description: DEFAULT_DESCRIPTION,
  },
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={ibmPlexSans.variable}>
      <body className={ibmPlexSans.className}>
        <ToastProvider>
          <AuthProvider>
            <MobileSidebarProvider>{children}</MobileSidebarProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
