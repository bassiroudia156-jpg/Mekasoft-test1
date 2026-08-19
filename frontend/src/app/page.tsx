// Ported from Banani LandingPage.jsx (desktop) + LandingPageMobile.jsx
// (mobile) — two full separate mockups of the same page, not one desktop
// file with a responsive companion. Merged into one component per section:
// unprefixed classes are LandingPageMobile's exact spec, `lg:` layers
// LandingPage's exact desktop spec on top. Where the two fetched variants
// use genuinely different copy (not just resized text — Banani wrote
// shorter mobile copy in several sections), both strings are kept via a
// `<span className="lg:hidden">`/`<span className="hidden lg:inline">`
// pair rather than picking one and losing the other's fidelity. Server
// component — no client JS needed except one isolated leaf (FaqAccordion).
// Was previously `redirect('/login')` (see .planning/banani/STATUS.md
// domain A and landing-legal-pages.md for the decisions behind this
// replacement). Reverted (2026-08-17): an auto-redirect to /dashboard for
// already-authenticated visitors was tried and confirmed with the user, but
// it fired within seconds of landing here and made the page impossible to
// actually review — always renders the marketing page now regardless of
// auth state, matching how /login already behaves.
import Link from 'next/link';
import BrandLogo from '@/components/ui/BrandLogo';
import Icon from '@/components/ui/Icon';
import PublicNav from '@/components/marketing/PublicNav';
import DashboardPreview from '@/components/marketing/DashboardPreview';
import ClientProfilePreview from '@/components/marketing/ClientProfilePreview';
import FaqAccordion from '@/components/marketing/FaqAccordion';
import Reveal from '@/components/marketing/Reveal';

const PROBLEM_CARDS = [
  {
    icon: 'search',
    titleM: 'Informations',
    titleD: 'Informations difficiles à retrouver',
    descM: 'Retrouvez rapidement vos clients.',
    descD: "Retrouvez rapidement vos clients et l'historique de leurs véhicules.",
  },
  {
    icon: 'clock',
    titleM: 'Suivi',
    titleD: 'Suivi des réparations compliqué',
    descM: 'Sachez exactement quel véhicule est en cours.',
    descD: 'Sachez exactement quels véhicules sont en cours, en diagnostic ou terminés.',
  },
  {
    icon: 'file-minus',
    titleM: 'Devis',
    titleD: 'Devis et factures peu professionnels',
    descM: 'Créez des documents professionnels.',
    descD: 'Créez facilement des documents clairs et professionnels.',
  },
];

const FEATURES = [
  {
    icon: 'users',
    title: 'Clients & véhicules',
    desc: 'Centralisez vos clients et retrouvez chaque véhicule en quelques secondes.',
  },
  {
    icon: 'wrench',
    title: 'Réparations',
    desc: "Suivez chaque intervention, du diagnostic jusqu'à la fin des travaux.",
  },
  {
    icon: 'file-text',
    title: 'Devis & factures',
    desc: 'Créez des devis et factures professionnels sans perdre de temps.',
  },
  {
    icon: 'credit-card',
    title: 'Paiements',
    desc: 'Suivez ce qui a été payé et ce qui reste à encaisser.',
  },
];

const DASHBOARD_ITEMS = [
  { icon: 'car', labelM: 'Véhicules en cours', labelD: 'Véhicules en cours' },
  { icon: 'wrench', labelM: 'Réparations du jour', labelD: 'Réparations du jour' },
  { icon: 'banknote', labelM: 'Paiements', labelD: 'Paiements à suivre' },
];

const STEPS = [
  {
    num: '01',
    title: 'Créez votre garage',
    desc: 'Configurez votre espace Mekasoft en quelques minutes.',
  },
  {
    num: '02',
    title: 'Ajoutez vos clients et véhicules',
    desc: 'Commencez à construire votre historique garage.',
  },
  {
    num: '03',
    title: 'Gérez vos réparations',
    desc: 'Suivez vos interventions, devis, factures et paiements depuis un seul endroit.',
  },
];

const BENEFITS = [
  {
    icon: 'zap',
    title: 'Simple',
    desc: 'Une interface claire que votre équipe peut prendre en main rapidement.',
  },
  {
    icon: 'map-pin',
    title: 'Adapté au terrain',
    desc: 'Conçu avec les réalités des garages africains en tête.',
  },
  {
    // lucide-react renamed "Unlock" → "LockOpen" in the version this
    // project pins (see package.json) — same meaning, valid icon name.
    icon: 'lock-open',
    title: 'Accessible',
    desc: 'Un outil professionnel sans la complexité des logiciels traditionnels.',
  },
  {
    icon: 'smartphone',
    title: 'Mobile',
    desc: 'Utilisez Mekasoft depuis votre téléphone, tablette ou ordinateur.',
  },
];

// 2026-08-18 — genuine freemium (was a paid-only 5k/15k "Starter/Pro" model
// with a 14-day trial and no real free tier). Mirrors
// lib/server/plans/limits.ts's PLAN_LIMITS/PLAN_PRICING — kept as a local
// copy rather than imported (that module lives under lib/server/ as the
// enforcement source of truth; this is public marketing copy of the same
// numbers, not the enforcement itself — see that file's own comment).
const FREE_FEATURES = [
  { m: '3 clients max', d: "Jusqu'à 3 clients" },
  { m: '3 véhicules max', d: "Jusqu'à 3 véhicules" },
  { m: '5 interventions/mois', d: '5 interventions par mois' },
  { m: 'Devis & factures PDF', d: 'Devis & factures PDF' },
  { m: 'Suivi des paiements', d: 'Suivi des paiements' },
];

const PRO_FEATURES = [
  { m: 'Clients illimités', d: 'Clients illimités' },
  { m: 'Véhicules illimités', d: 'Véhicules illimités' },
  { m: 'Interventions illimitées', d: 'Interventions illimitées' },
  { m: 'Partage WhatsApp', d: 'Partage de factures sur WhatsApp' },
  { m: 'Logo sur les factures', d: 'Logo du garage sur les factures' },
];

const BUSINESS_FEATURES = [
  { m: 'Tout Pro', d: 'Toutes les fonctions Pro' },
  { m: "Jusqu'à 5 utilisateurs", d: "Jusqu'à 5 utilisateurs" },
  { m: 'Rôles & permissions', d: "Rôles & permissions par membre d'équipe" },
  { m: 'Rapport mensuel', d: "Rapport d'activité mensuel (PDF)" },
  { m: 'Export de données', d: 'Export de données (CSV)' },
];

const FAQS = [
  {
    q: 'Mekasoft est-il adapté aux petits garages ?',
    a: 'Oui, Mekasoft est conçu pour les garages de toutes tailles, des petites structures aux ateliers en croissance.',
  },
  {
    q: 'Puis-je utiliser Mekasoft sur mon téléphone ?',
    a: 'Oui, Mekasoft fonctionne sur smartphone, tablette et ordinateur depuis un simple navigateur.',
  },
  {
    q: 'Puis-je gérer plusieurs véhicules pour un même client ?',
    a: 'Oui, chaque client peut avoir autant de véhicules que nécessaire dans son dossier.',
  },
  {
    q: 'Puis-je créer des devis et factures ?',
    a: 'Oui, vous pouvez créer et envoyer des devis et factures professionnels directement depuis Mekasoft.',
  },
  {
    q: 'Puis-je utiliser Mekasoft gratuitement, sans limite de temps ?',
    a: "Oui — le plan Gratuit reste gratuit à vie, sans carte bancaire. Il couvre jusqu'à 3 clients, 3 véhicules et 5 interventions par mois. Passez à Pro ou Business quand votre garage en a besoin.",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-background font-body">
      <PublicNav />

      {/* HERO */}
      <section className="px-4 pt-10 pb-12 lg:px-12 lg:pt-20 lg:pb-16 bg-background">
        <div className="w-full lg:max-w-5xl lg:mx-auto">
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center animate-fade-in-up">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 lg:py-1.5 bg-secondary rounded-full mb-4 lg:mb-6">
                <div className="w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full bg-primary" />
                <span className="text-xs font-medium text-secondary-foreground">
                  <span className="lg:hidden">Logiciel de gestion</span>
                  <span className="hidden lg:inline">Logiciel de gestion pour garages</span>
                </span>
              </div>
              <h1 className="text-3xl lg:text-5xl font-bold font-headings text-foreground leading-tight mb-3 lg:mb-5">
                Gérez votre garage.
                <br />
                <span className="text-primary">Simplement.</span>
              </h1>
              <p className="text-sm lg:text-base text-muted-foreground leading-relaxed mb-6 lg:mb-8">
                Clients, véhicules, réparations, devis et factures réunis au même endroit.
              </p>
              <div className="flex justify-center">
                <Link
                  href="/signup"
                  className="bg-primary text-primary-foreground font-medium px-6 lg:px-8 py-2.5 lg:py-3 rounded-md text-sm lg:text-base w-full lg:w-auto text-center hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.03] active:scale-[0.98] transition-all duration-200"
                >
                  Commencer gratuitement
                </Link>
              </div>
            </div>
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <Reveal>
        <section className="px-4 py-12 lg:px-12 lg:py-20 bg-surface border-t border-border">
          <div className="w-full lg:max-w-5xl lg:mx-auto">
            <div className="text-center mb-8 lg:mb-12">
              <p className="text-xs font-medium text-primary uppercase tracking-widest mb-2 lg:mb-3">
                Le problème
              </p>
              <h2 className="text-2xl lg:text-3xl font-bold font-headings text-foreground">
                <span className="lg:hidden">Votre garage mérite mieux.</span>
                <span className="hidden lg:inline">
                  Votre garage mérite mieux qu&apos;un cahier et WhatsApp.
                </span>
              </h2>
              <p className="text-xs lg:text-base text-muted-foreground mt-3 lg:mt-4 lg:max-w-xl lg:mx-auto">
                <span className="lg:hidden">
                  Quand les informations sont dispersées, il devient difficile de suivre les
                  véhicules et les paiements.
                </span>
                <span className="hidden lg:inline">
                  Quand les informations sont dispersées, il devient difficile de suivre les
                  véhicules, les réparations et les paiements.
                </span>
              </p>
            </div>
            <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-6">
              {PROBLEM_CARDS.map((c) => (
                <div
                  key={c.icon}
                  className="bg-background border border-border rounded-lg p-4 lg:p-6 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="flex gap-3 items-start lg:block">
                    <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-md bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5 lg:mt-0 lg:mb-4">
                      <Icon
                        i={c.icon}
                        size={16}
                        className="text-primary w-3.5 h-3.5 lg:w-4 lg:h-4"
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-sm mb-0 lg:mb-2">
                        <span className="lg:hidden">{c.titleM}</span>
                        <span className="hidden lg:inline">{c.titleD}</span>
                      </h3>
                      <p className="text-xs lg:text-sm text-muted-foreground leading-relaxed">
                        <span className="lg:hidden">{c.descM}</span>
                        <span className="hidden lg:inline">{c.descD}</span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* SOLUTION */}
      <Reveal>
        <section
          id="fonctionnalites"
          className="px-4 py-12 lg:px-12 lg:py-20 bg-background border-t border-border"
        >
          <div className="w-full lg:max-w-5xl lg:mx-auto">
            <div className="text-center mb-8 lg:mb-12">
              <p className="text-xs font-medium text-primary uppercase tracking-widest mb-2 lg:mb-3">
                La solution
              </p>
              <h2 className="text-2xl lg:text-3xl font-bold font-headings text-foreground">
                <span className="lg:hidden">Tout au même endroit.</span>
                <span className="hidden lg:inline">Tout votre garage, au même endroit.</span>
              </h2>
              <p className="text-xs lg:text-base text-muted-foreground mt-3 lg:mt-4 lg:max-w-xl lg:mx-auto">
                <span className="lg:hidden">
                  MekaSoft rassemble les outils essentiels pour gérer votre garage.
                </span>
                <span className="hidden lg:inline">
                  Mekasoft rassemble les outils essentiels dont vous avez besoin pour gérer votre
                  atelier au quotidien.
                </span>
              </p>
            </div>
            <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-6">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="p-4 lg:p-6 flex gap-3 lg:gap-4 items-start bg-surface border border-border rounded-lg transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-md bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5 lg:mt-0">
                    <Icon
                      i={f.icon}
                      size={18}
                      className="text-accent w-3.5 h-3.5 lg:w-[18px] lg:h-[18px]"
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm mb-0.5 lg:mb-1">
                      {f.title}
                    </h3>
                    <p className="text-xs lg:text-sm text-muted-foreground leading-relaxed">
                      {f.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* PRODUCT SHOWCASE */}
      <Reveal>
        <section className="px-4 py-12 lg:px-12 lg:py-20 bg-secondary border-t border-border">
          <div className="w-full lg:max-w-5xl lg:mx-auto">
            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center">
              <div>
                <p className="text-xs font-medium text-accent uppercase tracking-widest mb-2 lg:mb-3">
                  Le tableau de bord
                </p>
                <h2 className="text-2xl lg:text-3xl font-bold font-headings text-accent mb-3 lg:mb-4">
                  <span className="lg:hidden">Voyez tout en un coup d&apos;œil.</span>
                  <span className="hidden lg:inline">
                    Voyez ce qui se passe dans votre garage en un coup d&apos;œil.
                  </span>
                </h2>
                <p className="text-xs lg:text-sm text-foreground leading-relaxed mb-4 lg:mb-8">
                  <span className="lg:hidden">
                    Un tableau de bord simple pour suivre l&apos;activité de votre garage.
                  </span>
                  <span className="hidden lg:inline">
                    Un tableau de bord simple pour suivre l&apos;activité de votre garage sans vous
                    perdre dans des menus compliqués.
                  </span>
                </p>
                <div className="space-y-2 lg:space-y-3">
                  {DASHBOARD_ITEMS.map((item) => (
                    <div key={item.icon} className="flex items-center gap-2 lg:gap-3">
                      <div className="hidden lg:flex w-7 h-7 rounded-md bg-accent/20 items-center justify-center">
                        <Icon i={item.icon} size={14} className="text-accent" />
                      </div>
                      <Icon
                        i={item.icon}
                        size={12}
                        className="text-accent flex-shrink-0 lg:hidden"
                      />
                      <span className="text-xs lg:text-sm text-foreground lg:font-medium">
                        <span className="lg:hidden">{item.labelM}</span>
                        <span className="hidden lg:inline">{item.labelD}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <ClientProfilePreview />
            </div>
          </div>
        </section>
      </Reveal>

      {/* HOW IT WORKS */}
      <Reveal>
        <section
          id="comment-ca-marche"
          className="px-4 py-12 lg:px-12 lg:py-20 bg-background border-t border-border"
        >
          <div className="w-full lg:max-w-5xl lg:mx-auto">
            <div className="text-center mb-8 lg:mb-14">
              <p className="text-xs font-medium text-primary uppercase tracking-widest mb-2 lg:mb-3">
                Comment ça marche
              </p>
              <h2 className="text-2xl lg:text-3xl font-bold font-headings text-foreground">
                <span className="lg:hidden">Commencez rapidement.</span>
                <span className="hidden lg:inline">Commencez en quelques minutes.</span>
              </h2>
            </div>
            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:gap-8">
              {STEPS.map((step, i) => (
                <div key={step.num} className="relative">
                  {i < STEPS.length - 1 && (
                    <>
                      <div className="lg:hidden absolute left-4 top-10 w-px h-6 bg-border" />
                      <div className="hidden lg:block absolute top-5 left-[calc(100%_-_16px)] w-full h-px border-t border-dashed border-muted z-0" />
                    </>
                  )}
                  <div className="relative z-10 flex gap-4 lg:block">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs lg:text-sm font-headings flex-shrink-0 lg:mb-4">
                      {step.num}
                    </div>
                    <div className="flex-1 pt-0.5 lg:pt-0">
                      <h3 className="font-semibold text-foreground text-sm lg:mb-2">
                        {step.title}
                      </h3>
                      <p className="text-xs lg:text-sm text-muted-foreground leading-relaxed">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* WHY MEKASOFT */}
      <Reveal>
        <section className="px-4 py-12 lg:px-12 lg:py-20 bg-surface border-t border-border">
          <div className="w-full lg:max-w-5xl lg:mx-auto">
            <div className="text-center mb-8 lg:mb-12">
              <p className="text-xs font-medium text-primary uppercase tracking-widest mb-2 lg:mb-3">
                Pourquoi Mekasoft
              </p>
              <h2 className="text-2xl lg:text-4xl font-bold font-headings text-foreground">
                Pensé pour les garages.
              </h2>
            </div>
            <div className="flex flex-col gap-4 lg:grid lg:grid-cols-4 lg:gap-6">
              {BENEFITS.map((b) => (
                <div
                  key={b.title}
                  className="text-center transition-transform duration-200 hover:-translate-y-1"
                >
                  <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg lg:rounded-xl bg-secondary flex items-center justify-center mx-auto mb-3 lg:mb-4">
                    <Icon i={b.icon} size={20} className="text-primary w-4 h-4 lg:w-5 lg:h-5" />
                  </div>
                  <h3 className="font-semibold text-foreground text-sm mb-1 lg:mb-2">{b.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* PRICING */}
      <Reveal>
        <section
          id="tarifs"
          className="px-4 py-12 lg:px-12 lg:py-20 bg-background border-t border-border"
        >
          <div className="w-full lg:max-w-5xl lg:mx-auto">
            <div className="text-center mb-8 lg:mb-12">
              <p className="text-xs font-medium text-primary uppercase tracking-widest mb-2 lg:mb-3">
                Tarifs
              </p>
              <h2 className="text-2xl lg:text-3xl font-bold font-headings text-foreground">
                <span className="lg:hidden">Gratuit pour commencer.</span>
                <span className="hidden lg:inline">Gratuit pour commencer, à vie.</span>
              </h2>
              <p className="text-xs lg:text-base text-muted-foreground mt-2 lg:mt-4">
                <span className="lg:hidden">Aucune carte bancaire requise.</span>
                <span className="hidden lg:inline">
                  Le cœur de Mekasoft reste gratuit. Passez à un plan supérieur quand votre garage
                  grandit — aucune carte bancaire requise pour démarrer.
                </span>
              </p>
            </div>
            <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-6">
              {/* Gratuit */}
              <div className="bg-surface border border-border rounded-lg lg:rounded-xl p-5 lg:p-8 flex flex-col">
                <h3 className="font-bold font-headings text-foreground text-base lg:text-lg mb-1">
                  Gratuit
                </h3>
                <p className="text-xs text-muted-foreground mb-4 lg:mb-6">
                  <span className="lg:hidden">Pour démarrer</span>
                  <span className="hidden lg:inline">Pour démarrer, sans engagement</span>
                </p>
                <div className="flex items-baseline gap-1 mb-4 lg:mb-6">
                  <span className="text-2xl lg:text-4xl font-bold text-foreground">0</span>
                  <span className="text-xs lg:text-sm text-muted-foreground">
                    <span className="lg:hidden">FCFA</span>
                    <span className="hidden lg:inline">FCFA — à vie</span>
                  </span>
                </div>
                <div className="space-y-2 lg:space-y-3 mb-5 lg:mb-8 flex-1">
                  {FREE_FEATURES.map((f) => (
                    <div key={f.d} className="flex items-center gap-2">
                      <Icon
                        i="check"
                        size={13}
                        className="text-primary flex-shrink-0 w-[11px] h-[11px] lg:w-[13px] lg:h-[13px]"
                      />
                      <span className="text-xs lg:text-sm text-foreground">
                        <span className="lg:hidden">{f.m}</span>
                        <span className="hidden lg:inline">{f.d}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/signup"
                  className="w-full py-2 lg:py-3 border border-primary text-primary rounded lg:rounded-md text-xs lg:text-sm font-medium text-center hover:bg-primary/5 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  <span className="lg:hidden">Commencer</span>
                  <span className="hidden lg:inline">Commencer gratuitement</span>
                </Link>
              </div>

              {/* Pro */}
              <div className="bg-foreground rounded-lg lg:rounded-xl p-5 lg:p-8 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold font-headings text-background text-base lg:text-lg">
                    Pro
                  </h3>
                  <span className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded lg:rounded-full font-medium">
                    Populaire
                  </span>
                </div>
                <p className="text-xs text-background/60 mb-4 lg:mb-6">
                  <span className="lg:hidden">Garages en croissance</span>
                  <span className="hidden lg:inline">Pour les garages en croissance</span>
                </p>
                <div className="mb-4 lg:mb-6">
                  <div className="flex items-baseline gap-2 whitespace-nowrap">
                    <span className="text-sm lg:text-base text-background/40 line-through">
                      12 000
                    </span>
                    <span className="text-2xl lg:text-4xl font-bold text-background">9 900</span>
                  </div>
                  <span className="text-xs lg:text-sm text-background/60">
                    <span className="lg:hidden">FCFA/mois</span>
                    <span className="hidden lg:inline">FCFA / mois</span>
                  </span>
                </div>
                <div className="space-y-2 lg:space-y-3 mb-5 lg:mb-8 flex-1">
                  {PRO_FEATURES.map((f) => (
                    <div key={f.d} className="flex items-center gap-2">
                      <Icon
                        i="check"
                        size={13}
                        className="text-primary flex-shrink-0 w-[11px] h-[11px] lg:w-[13px] lg:h-[13px]"
                      />
                      <span className="text-xs lg:text-sm text-background/90">
                        <span className="lg:hidden">{f.m}</span>
                        <span className="hidden lg:inline">{f.d}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/subscriptions/checkout?plan=PRO"
                  className="w-full py-2 lg:py-3 bg-primary text-primary-foreground rounded lg:rounded-md text-xs lg:text-sm font-medium text-center hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  S&apos;abonner
                </Link>
              </div>

              {/* Business */}
              <div className="bg-surface border border-border rounded-lg lg:rounded-xl p-5 lg:p-8 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold font-headings text-foreground text-base lg:text-lg">
                    Business
                  </h3>
                  <span className="text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded lg:rounded-full font-medium">
                    Équipes
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-4 lg:mb-6">
                  <span className="lg:hidden">Plusieurs garagistes</span>
                  <span className="hidden lg:inline">Pour les ateliers avec une équipe</span>
                </p>
                <div className="mb-4 lg:mb-6">
                  <div className="flex items-baseline gap-2 whitespace-nowrap">
                    <span className="text-sm lg:text-base text-muted-foreground/60 line-through">
                      25 000
                    </span>
                    <span className="text-2xl lg:text-4xl font-bold text-foreground">19 900</span>
                  </div>
                  <span className="text-xs lg:text-sm text-muted-foreground">
                    <span className="lg:hidden">FCFA/mois</span>
                    <span className="hidden lg:inline">FCFA / mois</span>
                  </span>
                </div>
                <div className="space-y-2 lg:space-y-3 mb-5 lg:mb-8 flex-1">
                  {BUSINESS_FEATURES.map((f) => (
                    <div key={f.d} className="flex items-center gap-2">
                      <Icon
                        i="check"
                        size={13}
                        className="text-primary flex-shrink-0 w-[11px] h-[11px] lg:w-[13px] lg:h-[13px]"
                      />
                      <span className="text-xs lg:text-sm text-foreground">
                        <span className="lg:hidden">{f.m}</span>
                        <span className="hidden lg:inline">{f.d}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/subscriptions/checkout?plan=BUSINESS"
                  className="w-full py-2 lg:py-3 border border-primary text-primary rounded lg:rounded-md text-xs lg:text-sm font-medium text-center hover:bg-primary/5 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  S&apos;abonner
                </Link>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* FAQ */}
      <Reveal>
        <section
          id="faq"
          className="px-4 py-12 lg:px-12 lg:py-20 bg-surface border-t border-border"
        >
          <div className="w-full lg:max-w-3xl lg:mx-auto">
            <div className="text-center mb-8 lg:mb-12">
              <p className="text-xs font-medium text-primary uppercase tracking-widest mb-2 lg:mb-3">
                FAQ
              </p>
              <h2 className="text-2xl lg:text-3xl font-bold font-headings text-foreground">
                Questions fréquentes
              </h2>
            </div>
            <FaqAccordion faqs={FAQS} />
          </div>
        </section>
      </Reveal>

      {/* FINAL CTA */}
      <Reveal>
        <section className="px-4 py-10 lg:px-12 lg:py-20 bg-primary lg:border-t lg:border-border">
          <div className="w-full lg:max-w-2xl lg:mx-auto text-center">
            <h2 className="text-xl lg:text-3xl font-bold font-headings text-primary-foreground mb-3 lg:mb-4">
              <span className="lg:hidden">Prêt à commencer ?</span>
              <span className="hidden lg:inline">Prêt à mieux gérer votre garage ?</span>
            </h2>
            <p className="text-xs lg:text-base text-primary-foreground/80 mb-5 lg:mb-8">
              <span className="lg:hidden">Découvrez une gestion plus simple.</span>
              <span className="hidden lg:inline">
                Commencez gratuitement et découvrez une gestion plus simple de votre atelier.
              </span>
            </p>
            <Link
              href="/signup"
              className="inline-block w-full lg:w-auto bg-primary-foreground text-primary font-medium px-6 lg:px-8 py-2.5 lg:py-3 rounded lg:rounded-md text-sm hover:bg-primary-foreground/90 hover:scale-[1.03] active:scale-[0.98] transition-all duration-200"
            >
              Commencer gratuitement
            </Link>
          </div>
        </section>
      </Reveal>

      {/* FOOTER */}
      <footer className="px-4 py-8 lg:px-12 lg:py-12 bg-foreground border-t border-border/20">
        <div className="w-full lg:max-w-5xl lg:mx-auto">
          <div className="lg:hidden mb-6">
            <BrandLogo variant="dark" className="h-14 w-auto mb-2" />
            <p className="text-xs text-background/50 leading-relaxed">
              Logiciel de gestion pour garages.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6 mb-6 lg:grid-cols-4 lg:gap-8 lg:mb-10">
            <div className="hidden lg:block col-span-1">
              <BrandLogo variant="dark" className="h-16 w-auto mb-3" />
              <p className="text-xs text-background/50 leading-relaxed">
                Logiciel de gestion pour garages.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-background/50 uppercase tracking-widest mb-3 lg:mb-4">
                Produit
              </p>
              <div className="space-y-2">
                <Link
                  href="/#fonctionnalites"
                  className="block text-xs lg:text-sm text-background/60 hover:text-background transition-colors duration-150"
                >
                  Fonctionnalités
                </Link>
                <Link
                  href="/#tarifs"
                  className="block text-xs lg:text-sm text-background/60 hover:text-background transition-colors duration-150"
                >
                  Tarifs
                </Link>
                <Link
                  href="/#faq"
                  className="block text-xs lg:text-sm text-background/60 hover:text-background transition-colors duration-150"
                >
                  FAQ
                </Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <p className="text-xs font-bold text-background/50 uppercase tracking-widest mb-4">
                Entreprise
              </p>
              <div className="space-y-2">
                {/* No "about" page exists anywhere in the Banani flow or the
                    app — plain text rather than a dead link. */}
                <span className="block text-sm text-background/60">À propos</span>
                <a
                  href="mailto:support@mekasoft.com"
                  className="block text-sm text-background/60 hover:text-background"
                >
                  Contact
                </a>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-background/50 uppercase tracking-widest mb-3 lg:mb-4">
                Légal
              </p>
              <div className="space-y-2">
                <Link
                  href="/terms"
                  className="block text-xs lg:text-sm text-background/60 hover:text-background transition-colors duration-150"
                >
                  <span className="lg:hidden">Conditions</span>
                  <span className="hidden lg:inline">Conditions d&apos;utilisation</span>
                </Link>
                <Link
                  href="/privacy"
                  className="block text-xs lg:text-sm text-background/60 hover:text-background transition-colors duration-150"
                >
                  <span className="lg:hidden">Politique</span>
                  <span className="hidden lg:inline">Politique de confidentialité</span>
                </Link>
              </div>
            </div>
          </div>
          <div className="border-t border-border/10 pt-4 lg:pt-6">
            <p className="text-xs text-background/40">
              <span className="lg:hidden">© 2026 Mekasoft.</span>
              <span className="hidden lg:inline">© 2026 Mekasoft. Tous droits réservés.</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
