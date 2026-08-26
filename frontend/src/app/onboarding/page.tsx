// 4-step onboarding wizard — ported from Banani OnboardingStep1-4 (the
// single-panel centered layout with a progress bar; OnboardingWelcome's
// two-panel hero-with-stepper layout only covers steps 1-2 and was dropped
// in favor of the layout that's actually complete across all 4 steps, same
// reasoning as the /login layout choice — see IMPLEMENTATION-PLAN.md).
//
// The actual POST /api/organizations fires once, on the step 3 → step 4
// transition (step 4 is a pure success screen, no further input — the org
// must already exist by the time it renders). Step 1's "Passer pour
// l'instant" skips straight to /dashboard with no organization created;
// /dashboard shows the Banani-designed banner for that case and links back
// here to resume at step 2.
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { zPhone } from '@/lib/server/zod-helpers';
import OnboardingLogo from '@/components/onboarding/OnboardingLogo';
import OnboardingProgress from '@/components/onboarding/OnboardingProgress';
import Field from '@/components/ui/Field';
import PhoneField from '@/components/ui/PhoneField';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

type TeamSizeHint = 'SOLO' | 'SMALL' | 'MEDIUM' | 'LARGE';

const TEAM_SIZE_OPTIONS: { value: TeamSizeHint; icon: string; label: string; desc: string }[] = [
  { value: 'SOLO', icon: 'user', label: 'Moi uniquement', desc: 'Je gère seul mon garage' },
  { value: 'SMALL', icon: 'users', label: '2–5 personnes', desc: 'Une petite équipe' },
  {
    value: 'MEDIUM',
    icon: 'users-round',
    label: '6–10 personnes',
    desc: 'Une équipe intermédiaire',
  },
  { value: 'LARGE', icon: 'building-2', label: 'Plus de 10', desc: 'Un grand atelier' },
];

interface OrgSummary {
  id: string;
  slug: string;
  name: string;
}

export default function OnboardingPage() {
  const user = useUser();
  const router = useRouter();

  const [checkingExisting, setCheckingExisting] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [teamSizeHint, setTeamSizeHint] = useState<TeamSizeHint>('SOLO');

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdOrg, setCreatedOrg] = useState<OrgSummary | null>(null);

  // Gate: a user who already belongs to an organization has nothing to
  // onboard — skip straight to /dashboard instead of showing the wizard.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ organizations: OrgSummary[] }>('/api/organizations');
        if (!cancelled && res.organizations.length > 0) {
          router.replace('/dashboard');
          return;
        }
      } catch {
        // Network hiccup — fall through to showing the wizard rather than
        // blocking the user indefinitely.
      }
      if (!cancelled) setCheckingExisting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (!user || checkingExisting) return null;

  function onStep2Submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (name.trim().length < 2) {
      setFormError('Le nom du garage est trop court.');
      return;
    }
    // Validate BEFORE advancing — the server enforces the same E.164 shape
    // (zPhone, imported here rather than duplicated) but previously this
    // only surfaced as a bare "INVALID_BODY" on step 3's final submit,
    // which looked like the "Continuer" button silently doing nothing.
    if (!zPhone.safeParse(phone).success) {
      setFormError('Le numéro doit être au format international, ex : +221771234567.');
      return;
    }
    if (city.trim().length < 2) {
      setFormError('Indiquez une ville.');
      return;
    }
    setStep(3);
  }

  async function onStep3Submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await api<{ organization: OrgSummary }>('/api/organizations', {
        method: 'POST',
        body: { name, phone, city, teamSizeHint },
      });
      setCreatedOrg(res.organization);
      setStep(4);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ORGANIZATION_ALREADY_EXISTS') {
        router.replace('/dashboard');
        return;
      }
      // Defense in depth: if something about the garage info is still
      // invalid despite step 2's own check (e.g. name/city drifted), send
      // the user back there with a clear message instead of leaving them
      // stuck on step 3 staring at a raw error code.
      if (err instanceof ApiError && err.code === 'INVALID_BODY') {
        setFormError('Certaines informations du garage sont invalides — vérifiez-les.');
        setStep(2);
        return;
      }
      setFormError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-background min-h-screen flex items-center justify-center px-4 py-10">
      {step === 1 && (
        <div className="flex flex-col items-center text-center max-w-md w-full">
          <OnboardingLogo size="lg" className="mb-16" />
          <div className="mb-12">
            <h1 className="text-3xl font-bold font-headings text-foreground mb-4">
              Bienvenue sur MekaSoft <span>👋</span>
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              Configurons votre garage en quelques minutes.
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <Button variant="primary" onClick={() => setStep(2)} className="w-full py-3 text-base">
              Commencer
            </Button>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="text-sm text-muted-foreground font-medium py-2"
            >
              Passer pour l&apos;instant
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col max-w-lg w-full">
          <OnboardingLogo className="mb-12" />
          <OnboardingProgress step={2} />
          <h1 className="text-2xl font-bold font-headings text-foreground mb-2">
            Parlons de votre garage.
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            Ces informations permettent d&apos;identifier votre garage. Vous pourrez les modifier
            plus tard.
          </p>
          <form onSubmit={onStep2Submit} className="flex flex-col gap-5">
            <Field
              label="Nom du garage"
              name="name"
              required
              value={name}
              onChange={setName}
              placeholder="Garage Dakar Auto"
            />
            <PhoneField
              label="Téléphone"
              name="phone"
              required
              value={phone}
              onChange={setPhone}
              helper="Choisissez le pays puis tapez ou collez le numéro — le format s'adapte automatiquement."
            />
            <Field
              label="Ville"
              name="city"
              required
              value={city}
              onChange={setCity}
              placeholder="Dakar"
            />
            {formError && (
              <p role="alert" className="text-xs text-warning">
                {formError}
              </p>
            )}
            <div className="flex flex-col gap-3 mt-2">
              <Button type="submit" variant="primary" className="w-full py-3 text-base">
                Continuer
              </Button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-sm text-muted-foreground font-medium py-2 text-center"
              >
                Retour
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col items-center max-w-lg w-full">
          <OnboardingLogo className="mb-12" />
          <OnboardingProgress step={3} />
          <div className="w-full mb-8">
            <h1 className="text-2xl font-bold font-headings text-foreground mb-2">
              Qui travaille dans votre garage ?
            </h1>
            <p className="text-sm text-muted-foreground">
              Combien de personnes travaillent actuellement dans votre garage ?
            </p>
          </div>

          <form onSubmit={onStep3Submit} className="w-full flex flex-col gap-3">
            {TEAM_SIZE_OPTIONS.map((opt) => {
              const selected = teamSizeHint === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTeamSizeHint(opt.value)}
                  className={`w-full flex items-center gap-4 p-4 rounded-md border text-left ${
                    selected
                      ? 'border-2 border-primary bg-secondary'
                      : 'border border-border bg-surface'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${selected ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <Icon
                      i={opt.icon}
                      size={16}
                      className={selected ? 'text-primary-foreground' : 'text-muted-foreground'}
                    />
                  </div>
                  <div>
                    <div
                      className={`text-sm ${selected ? 'font-semibold' : 'font-medium'} text-foreground`}
                    >
                      {opt.label}
                    </div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </div>
                  <div className="ml-auto">
                    {selected ? (
                      <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                        <Icon i="check" size={11} className="text-primary-foreground" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 border-2 border-border rounded-full" />
                    )}
                  </div>
                </button>
              );
            })}

            {formError && (
              <p role="alert" className="text-xs text-warning">
                {formError}
              </p>
            )}

            <div className="w-full mt-6 flex flex-col gap-3">
              <Button type="submit" variant="primary" disabled={submitting} className="w-full py-3">
                {submitting ? 'Création…' : 'Continuer'}
              </Button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-sm text-muted-foreground font-medium py-2 text-center"
              >
                Retour
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col items-center text-center max-w-md w-full">
          <OnboardingLogo className="mb-14" />
          <OnboardingProgress step={4} complete />

          <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mb-6">
            <Icon i="circle-check" size={32} className="text-success" />
          </div>

          <div className="mb-10">
            <h1 className="text-2xl font-bold font-headings text-foreground mb-3">
              Votre garage est prêt <span>🎉</span>
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Vous pouvez maintenant commencer à gérer vos clients et vos véhicules avec MekaSoft.
            </p>
          </div>

          <div className="w-full bg-surface border border-border rounded-md p-4 mb-10 text-left">
            {[
              `${createdOrg?.name ?? 'Votre garage'} — configuré`,
              'Profil utilisateur — activé',
              'Accès MekaSoft — prêt',
            ].map((line) => (
              <div key={line} className="flex items-center gap-3 py-1.5">
                <div className="w-5 h-5 bg-success/10 rounded flex items-center justify-center flex-shrink-0">
                  <Icon i="check" size={11} className="text-success" />
                </div>
                <span className="text-sm text-foreground">{line}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 w-full">
            <Button
              variant="accent"
              onClick={() => router.push('/clients/new')}
              className="w-full py-3 text-base font-semibold"
            >
              <Icon i="user-plus" size={16} />
              Ajouter mon premier client
            </Button>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="text-sm text-primary font-medium py-2"
            >
              Découvrir le tableau de bord
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
