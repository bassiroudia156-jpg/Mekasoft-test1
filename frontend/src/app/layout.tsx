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

export const metadata: Metadata = {
  title: 'MekaSoft',
  description:
    "Gestion d'atelier automobile — clients, véhicules, interventions, factures, paiements.",
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
