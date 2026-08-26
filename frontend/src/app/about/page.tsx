// 2026-08-24 — closes a gap the landing page's own footer already flagged
// (see app/page.tsx's "No 'about' page exists anywhere in the Banani flow
// or the app" comment on the dead "À propos" span, now a real link here).
// The PRD (planning_prd-mekasoft, Risque 4 — "Confiance et sécurité des
// données") calls for a credible about page precisely because the target
// user has never trusted a garage's client list to software before:
// "qui est derrière MekaSoft, pourquoi on fait ça, un numéro WhatsApp de
// support visible."
//
// Content below sticks to what's actually verifiable in this codebase —
// the product's real purpose (from the PRD's own Vision section) and the
// support email already used elsewhere (Terms page, footer mailto). No
// founder name, team bio, or WhatsApp number is invented: none exists
// anywhere in the repo, and fabricating one here would be the opposite of
// the "credible" page this section exists to be. TODO once a real WhatsApp
// Business number exists: add it next to SUPPORT_EMAIL below.
import type { Metadata } from 'next';
import PublicNav from '@/components/marketing/PublicNav';

export const metadata: Metadata = {
  title: 'À propos',
  description:
    "Pourquoi MekaSoft existe et pour qui : la gestion d'atelier mécanique pensée pour les garages indépendants d'Afrique francophone.",
  alternates: { canonical: '/about' },
  robots: { index: true, follow: true },
};

const SUPPORT_EMAIL = 'support@mekasoft.com';

export default function AboutPage() {
  return (
    <div className="bg-background font-body">
      <PublicNav />

      <section className="px-4 py-10 lg:px-12 lg:py-16 bg-background">
        <div className="w-full lg:max-w-3xl lg:mx-auto animate-fade-in-up">
          <h1 className="text-3xl lg:text-4xl font-bold font-headings text-foreground mb-2">
            À propos de MekaSoft
          </h1>
          <p className="text-sm text-muted-foreground mb-10 lg:mb-12">
            La gestion d&apos;atelier, sans cahier ni Excel éparpillé.
          </p>

          <div className="space-y-8 lg:space-y-10 text-sm leading-relaxed">
            <div>
              <h2 className="text-base lg:text-lg font-bold font-headings text-foreground mb-3 lg:mb-4">
                Pourquoi MekaSoft existe
              </h2>
              <p className="text-muted-foreground">
                Les ateliers mécaniques d&apos;Afrique de l&apos;Ouest fonctionnent aujourd&apos;hui
                avec des cahiers, la mémoire du chef d&apos;atelier et des conversations WhatsApp
                dispersées. Cette organisation fait perdre de l&apos;argent en silence : des travaux
                réalisés mais jamais facturés, un historique véhicule introuvable dès qu&apos;un
                mécanicien change de garage, des clients qui contestent un prix faute de devis
                écrit. MekaSoft existe pour régler ça — simplement, depuis un téléphone, sans
                changer la façon dont un garage travaille au quotidien.
              </p>
            </div>

            <div>
              <h2 className="text-base lg:text-lg font-bold font-headings text-foreground mb-3 lg:mb-4">
                Pour qui
              </h2>
              <p className="text-muted-foreground">
                Pour les garages indépendants — un seul site, une équipe de quelques mécaniciens,
                pas de service comptabilité dédié. Pas pour les réseaux de concessionnaires ou les
                ateliers déjà équipés d&apos;un ERP. MekaSoft est volontairement simple : un client,
                un véhicule, une intervention, un devis, une facture — rien de plus que ce dont un
                garage a réellement besoin.
              </p>
            </div>

            <div>
              <h2 className="text-base lg:text-lg font-bold font-headings text-foreground mb-3 lg:mb-4">
                Vos données vous appartiennent
              </h2>
              <p className="text-muted-foreground">
                Un garage qui a toujours géré ses clients sur papier a raison d&apos;être prudent
                avant de confier ces informations à un outil qu&apos;il ne contrôle pas. Nous ne
                supprimons jamais les données d&apos;un garage qui arrête de payer son abonnement —
                le compte repasse en plan gratuit et garde un accès complet à tout ce qui a déjà été
                enregistré ; seule la création de nouveaux clients, véhicules ou interventions
                au-delà des limites du plan gratuit est mise en pause.
              </p>
            </div>

            <div>
              <h2 className="text-base lg:text-lg font-bold font-headings text-foreground mb-3 lg:mb-4">
                Nous contacter
              </h2>
              <p className="text-muted-foreground">
                Une question, un problème de paiement, une suggestion&nbsp;? Écrivez-nous à{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary font-medium">
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </div>
          </div>

          <div className="mt-12 lg:mt-16 pt-8 border-t border-border">
            <p className="text-xs text-muted-foreground">© 2026 MekaSoft. Tous droits réservés.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
