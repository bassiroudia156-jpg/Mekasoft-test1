// Ported from Banani EditShopSettingsPage.
//
// Guarded for ADMIN+ org role (Decision 9) — MEMBER callers are redirected
// back to /profile rather than shown a form that would 403 on submit.
// "Horaires d'ouverture" are free-text Fields (not structured time-pickers)
// since Banani's own mock shows flexible values like "Fermé", not fixed
// HH:MM pairs.
//
// 2026-08-19: the Atelier summary card that links here moved from /settings
// (retired) to /profile — this edit form's own URL didn't need to move, only
// its redirect targets and the Sidebar highlight below.
'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { uploadFile } from '@/lib/uploadFile';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import Sidebar from '@/components/layout/Sidebar';
import PageHeader from '@/components/ui/PageHeader';
import FormSection from '@/components/ui/FormSection';
import Field from '@/components/ui/Field';
import PhoneField from '@/components/ui/PhoneField';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import { SkeletonForm } from '@/components/ui/Skeleton';

interface OrgDetail {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  street: string | null;
  postalCode: string | null;
  country: string | null;
  taxId: string | null;
  siren: string | null;
  contactEmail: string | null;
  hoursWeekday: string | null;
  hoursSaturday: string | null;
  hoursSunday: string | null;
  plan: string;
  logoUrl: string | null;
}

export default function EditShopSettingsPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('Sénégal');
  const [taxId, setTaxId] = useState('');
  const [siren, setSiren] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [hoursWeekday, setHoursWeekday] = useState('');
  const [hoursSaturday, setHoursSaturday] = useState('');
  const [hoursSunday, setHoursSunday] = useState('');
  const [plan, setPlan] = useState('FREE');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = user?.orgRole === 'OWNER' || user?.orgRole === 'ADMIN';
  const canBrand = plan === 'PRO' || plan === 'BUSINESS';

  // Role/org-membership gate now reads straight off `user` (AuthContext's
  // GET /api/auth/me already returns organizationId/orgRole — see Phase 8)
  // instead of a second useCallerOrganization() hook, which fired its own
  // duplicate, serialized GET /api/organizations in front of this effect's
  // own fetch of the same endpoint (2026-08-19 fix, same root cause as
  // Settings and Subscription Plans). One fetch now, and it starts
  // immediately once `user` is known instead of waiting on a second
  // network round-trip first.
  useEffect(() => {
    if (!user) return;
    if (!user.organizationId || !canEdit) {
      router.replace('/profile');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ organizations: OrgDetail[] }>('/api/organizations');
        const org = res.organizations[0];
        if (cancelled || !org) return;
        setName(org.name ?? '');
        setStreet(org.street ?? '');
        setCity(org.city ?? '');
        setPostalCode(org.postalCode ?? '');
        setCountry(org.country ?? 'Sénégal');
        setTaxId(org.taxId ?? '');
        setSiren(org.siren ?? '');
        setContactEmail(org.contactEmail ?? '');
        setPhone(org.phone ?? '');
        setHoursWeekday(org.hoursWeekday ?? '07h00 - 18h00');
        setHoursSaturday(org.hoursSaturday ?? '08h00 - 14h00');
        setHoursSunday(org.hoursSunday ?? 'Fermé');
        setPlan(org.plan ?? 'FREE');
        setLogoUrl(org.logoUrl ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, canEdit]);

  if (!user) return null;

  async function onUploadLogo(file: File) {
    setLogoUploading(true);
    try {
      const uploaded = await uploadFile(file);
      await api('/api/organizations', { method: 'PATCH', body: { logoUrl: uploaded.url } });
      setLogoUrl(uploaded.url);
      toast('Logo mis à jour.', 'success');
    } catch (err) {
      toast(
        err instanceof ApiError && err.code === 'PLAN_FEATURE_LOCKED'
          ? err.message
          : err instanceof ApiError
            ? err.message
            : "Échec de l'envoi du logo.",
        'error',
      );
    } finally {
      setLogoUploading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api('/api/organizations', {
        method: 'PATCH',
        body: {
          name,
          street: street || null,
          city,
          postalCode: postalCode || null,
          country: country || null,
          taxId: taxId || null,
          siren: siren || null,
          contactEmail: contactEmail || null,
          phone,
          hoursWeekday: hoursWeekday || null,
          hoursSaturday: hoursSaturday || null,
          hoursSunday: hoursSunday || null,
        },
      });
      toast('Informations de l’atelier mises à jour.', 'success');
      router.push('/profile');
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'ORG_ROLE_INSUFFICIENT'
          ? "Vous n'avez pas les droits pour modifier l'atelier."
          : err instanceof ApiError
            ? err.message
            : 'Erreur réseau.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar active="profile" />

      <div className="flex-1 flex flex-col min-w-0">
        <PageHeader eyebrow="Atelier" title="Modifier l'atelier" />

        <div className="flex-1 p-6">
          {loading ? (
            <SkeletonForm fields={6} />
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-6 max-w-2xl lg:mx-auto">
              <FormSection title="Image de marque">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-md border border-border bg-input flex items-center justify-center overflow-hidden shrink-0">
                    {logoUrl ? (
                      // Plain <img>, not next/image — external Cloudinary URL with no
                      // configured remotePatterns, and this is a small settings-page
                      // preview, not a perf-critical image. No @next/next rule is
                      // registered in this project's eslint config either way.
                      <img
                        src={logoUrl}
                        alt="Logo de l'atelier"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Icon i="image" size={20} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void onUploadLogo(file);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canBrand || logoUploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Icon i="upload" size={13} />
                      {logoUploading ? 'Envoi…' : 'Changer le logo'}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {canBrand
                        ? 'Affiché sur vos factures PDF. PNG/JPG, fond transparent recommandé.'
                        : 'Réservé aux plans Pro et Business — voir Mon profil > Abonnement.'}
                    </p>
                  </div>
                </div>
              </FormSection>

              <FormSection title="Informations générales">
                <div className="flex flex-col gap-4">
                  <Field
                    label="Nom de l'atelier"
                    name="name"
                    required
                    value={name}
                    onChange={setName}
                  />
                  <Field label="Adresse" name="street" value={street} onChange={setStreet} />
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Ville" name="city" required value={city} onChange={setCity} />
                    <Field
                      label="Code postal"
                      name="postalCode"
                      value={postalCode}
                      onChange={setPostalCode}
                    />
                  </div>
                  <Field label="Pays" name="country" value={country} onChange={setCountry} />
                </div>
              </FormSection>

              <FormSection title="Informations professionnelles">
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Numéro SIRET" name="taxId" value={taxId} onChange={setTaxId} />
                    <Field label="Numéro SIREN" name="siren" value={siren} onChange={setSiren} />
                  </div>
                  <Field
                    label="Adresse email de l'atelier"
                    name="contactEmail"
                    type="email"
                    value={contactEmail}
                    onChange={setContactEmail}
                  />
                  <PhoneField
                    label="Téléphone de l'atelier"
                    name="phone"
                    required
                    value={phone}
                    onChange={setPhone}
                  />
                </div>
              </FormSection>

              <FormSection title="Horaires d'ouverture">
                <div className="flex flex-col gap-4">
                  <Field
                    label="Lundi - Vendredi"
                    name="hoursWeekday"
                    value={hoursWeekday}
                    onChange={setHoursWeekday}
                  />
                  <Field
                    label="Samedi"
                    name="hoursSaturday"
                    value={hoursSaturday}
                    onChange={setHoursSaturday}
                  />
                  <Field
                    label="Dimanche"
                    name="hoursSunday"
                    value={hoursSunday}
                    onChange={setHoursSunday}
                  />
                </div>
              </FormSection>

              {error && (
                <p role="alert" className="text-xs text-warning">
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <Button type="submit" variant="primary" disabled={submitting}>
                  {submitting ? 'Enregistrement…' : 'Enregistrer les modifications'}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push('/profile')}>
                  Annuler
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
