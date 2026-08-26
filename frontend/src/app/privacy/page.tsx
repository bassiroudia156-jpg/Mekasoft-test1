// Ported from Banani PrivacyPolicy.jsx — desktop-only fetch (no mobile
// variant designed for this screen); same mobile-first responsive
// treatment as /terms and the shared PublicNav (see
// .planning/banani/landing-legal-pages.md). Banani's own screen stops at a
// one-line copyright — no full marketing footer here, respected exactly.
import type { Metadata } from 'next';
import PublicNav from '@/components/marketing/PublicNav';

// Overrides layout.tsx's blanket `robots: { index: false }` — one of only
// 3 Server Components in src/app/ (see proxy.ts's header comment for
// why every other route stays noindexed by default).
export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Politique de confidentialité de MekaSoft — quelles données nous collectons, pourquoi, et comment elles sont protégées.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
};

const SECTIONS = [
  {
    title: '1. Informations que nous collectons',
    intro: 'Nous collectons les informations suivantes :',
    list: [
      "Informations d'identification : nom, prénom, adresse email, numéro de téléphone",
      'Informations de garage : nom du garage, adresse, type de service',
      'Données de paiement : informations bancaires (traitées par des tiers sécurisés)',
      "Données d'utilisation : pages consultées, actions effectuées, adresse IP",
    ],
  },
  {
    title: '2. Utilisation de vos données',
    body: "Nous utilisons vos données pour : fournir et améliorer nos services, traiter vos paiements, communiquer avec vous concernant votre compte, envoyer des mises à jour produit et newsletters (si consentement), analyser l'utilisation du service pour l'optimiser.",
  },
  {
    title: '3. Partage de vos données',
    intro: 'Nous ne partageons vos données personnelles que dans les cas suivants :',
    list: [
      'Avec des fournisseurs de services (paiement, hébergement) liés par des accords de confidentialité',
      "Si la loi l'exige ou pour protéger nos droits légaux",
      "En cas de fusion, acquisition ou vente d'actifs (avec notification préalable)",
    ],
  },
  {
    title: '4. Sécurité de vos données',
    body: "Nous mettons en place des mesures de sécurité raisonnables pour protéger vos données : chiffrement SSL/TLS, authentification sécurisée, accès limité aux données personnelles. Cependant, aucune transmission Internet n'est 100% sécurisée.",
  },
  {
    title: '5. Durée de conservation',
    body: 'Nous conservons vos données personnelles aussi longtemps que votre compte est actif. Vous pouvez demander la suppression de vos données à tout moment. Certaines données peuvent être conservées pour des raisons légales ou comptables.',
  },
  {
    title: '6. Vos droits',
    intro: 'Vous avez le droit de :',
    list: [
      'Accéder à vos données personnelles',
      'Corriger ou mettre à jour vos données',
      'Demander la suppression de vos données',
      'Vous opposer au traitement de vos données',
      'Demander la portabilité de vos données',
    ],
  },
  {
    title: '7. Cookies',
    body: 'MekaSoft utilise des cookies pour améliorer votre expérience. Vous pouvez contrôler les cookies via les paramètres de votre navigateur. Certains cookies sont essentiels au fonctionnement du service.',
  },
  {
    title: '8. Contact',
    body: 'Pour toute question sur cette politique ou vos données, veuillez nous contacter à privacy@mekasoft.com.',
  },
  {
    title: '9. Modifications',
    body: 'MekaSoft se réserve le droit de modifier cette politique. Les modifications seront publiées sur cette page. Votre utilisation continue du service signifie votre acceptation des modifications.',
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-background font-body">
      <PublicNav />

      <section className="px-4 py-10 lg:px-12 lg:py-16 bg-background">
        <div className="w-full lg:max-w-3xl lg:mx-auto animate-fade-in-up">
          <h1 className="text-3xl lg:text-4xl font-bold font-headings text-foreground mb-2">
            Politique de confidentialité
          </h1>
          <p className="text-sm text-muted-foreground mb-10 lg:mb-12">
            Dernière mise à jour : janvier 2026
          </p>

          <div className="space-y-8 lg:space-y-10 text-sm leading-relaxed">
            {SECTIONS.map((section) => (
              <div key={section.title}>
                <h2 className="text-base lg:text-lg font-bold font-headings text-foreground mb-3 lg:mb-4">
                  {section.title}
                </h2>
                {section.body && <p className="text-muted-foreground">{section.body}</p>}
                {section.intro && <p className="text-muted-foreground mb-3">{section.intro}</p>}
                {section.list && (
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-2">
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="mt-12 lg:mt-16 pt-8 border-t border-border">
            <p className="text-xs text-muted-foreground">© 2026 MekaSoft. Tous droits réservés.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
