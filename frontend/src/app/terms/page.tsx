// Ported from Banani TermsOfUse.jsx — desktop-only fetch (no mobile variant
// designed for this screen); mobile-first responsive treatment below
// mirrors the same base/lg: pattern used on the landing page and its
// shared PublicNav (see .planning/banani/landing-legal-pages.md). Banani's
// own screen stops at a one-line copyright — no full marketing footer is
// shown here, respected exactly rather than padding it out.
import PublicNav from '@/components/marketing/PublicNav';

const SECTIONS = [
  {
    title: '1. Acceptation des conditions',
    body: "En accédant et en utilisant MekaSoft, vous acceptez d'être lié par ces conditions d'utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser ce service.",
  },
  {
    title: "2. Licence d'utilisation",
    body: 'MekaSoft vous accorde une licence limitée, non exclusive et non transférable pour utiliser ce service uniquement à des fins commerciales légales. Vous ne devez pas : reproduire, distribuer, transmettre, modifier ou créer des œuvres dérivées du contenu sans permission.',
  },
  {
    title: '3. Utilisation autorisée',
    intro:
      'Vous vous engagez à utiliser MekaSoft conformément à toutes les lois applicables et à ne pas :',
    list: [
      "Harceler, menacer, intimider ou commettre un acte violent à l'encontre de toute personne",
      'Transmettre du contenu obscène, offensant ou illégal',
      'Perturber le flux normal de dialogue au sein de MekaSoft',
      "Accéder ou modifier les données d'autres utilisateurs sans permission",
    ],
  },
  {
    title: '4. Limitation de responsabilité',
    body: "MekaSoft est fourni « tel quel » sans garantie d'aucune sorte. Nous ne serons pas responsables des dommages indirects, accidentels, spéciaux, consécutifs ou punitifs découlant de votre utilisation du service.",
  },
  {
    title: '5. Protection des données',
    body: 'Vos données personnelles sont traitées conformément à nos politiques de confidentialité. Nous nous engageons à protéger vos informations avec des mesures de sécurité appropriées.',
  },
  {
    title: '6. Modification des conditions',
    body: 'MekaSoft se réserve le droit de modifier ces conditions à tout moment. Les modifications seront effectives immédiatement après publication. Votre utilisation continue du service signifie votre acceptation des conditions modifiées.',
  },
  {
    title: '7. Résiliation',
    body: 'Nous nous réservons le droit de suspendre ou de résilier votre accès à MekaSoft à tout moment, pour quelque raison que ce soit, notamment en cas de violation de ces conditions.',
  },
  {
    title: '8. Contact',
    body: 'Pour toute question concernant ces conditions, veuillez nous contacter à support@mekasoft.com.',
  },
];

export default function TermsOfUsePage() {
  return (
    <div className="bg-background font-body">
      <PublicNav />

      <section className="px-4 py-10 lg:px-12 lg:py-16 bg-background">
        <div className="w-full lg:max-w-3xl lg:mx-auto animate-fade-in-up">
          <h1 className="text-3xl lg:text-4xl font-bold font-headings text-foreground mb-2">
            Conditions d&apos;utilisation
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
