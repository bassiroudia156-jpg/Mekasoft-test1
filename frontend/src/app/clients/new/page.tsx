// Ported from Banani AddNewClient — one form, client-side type toggle
// switches which extra fields render (AddNewIndividualClient = Particulier
// selected, AddNewClient_next1 = Entreprise selected, same page). Success
// state (CompanyCreatedSuccess/IndividualClientCreatedSuccess) is an
// internal view, not a separate route — same pattern as /login and the
// team modal.
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import PageHeader from '@/components/ui/PageHeader';
import FormSection from '@/components/ui/FormSection';
import RadioCard from '@/components/ui/RadioCard';
import Field from '@/components/ui/Field';
import PhoneField from '@/components/ui/PhoneField';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

type ClientType = 'INDIVIDUAL' | 'COMPANY';

interface CreatedClient {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}

export default function NewClientPage() {
  const user = useUser();
  const router = useRouter();

  const [view, setView] = useState<'form' | 'success'>('form');
  const [type, setType] = useState<ClientType>('INDIVIDUAL');
  const [created, setCreated] = useState<CreatedClient | null>(null);

  // Shared
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('Sénégal');
  const [notes, setNotes] = useState('');

  // Individual
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profession, setProfession] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [idNumber, setIdNumber] = useState('');

  // Company
  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [sector, setSector] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body =
        type === 'INDIVIDUAL'
          ? {
              type,
              phone,
              email: email || undefined,
              street: street || undefined,
              city: city || undefined,
              postalCode: postalCode || undefined,
              country: country || undefined,
              notes: notes || undefined,
              firstName,
              lastName,
              profession: profession || undefined,
              dateOfBirth: dateOfBirth || undefined,
              idNumber: idNumber || undefined,
            }
          : {
              type,
              phone,
              email: email || undefined,
              street: street || undefined,
              city: city || undefined,
              postalCode: postalCode || undefined,
              country: country || undefined,
              notes: notes || undefined,
              companyName,
              taxId: taxId || undefined,
              sector: sector || undefined,
              contactName: contactName || undefined,
              contactRole: contactRole || undefined,
              contactPhone: contactPhone || undefined,
              contactEmail: contactEmail || undefined,
            };
      const res = await api<{ client: CreatedClient }>('/api/clients', { method: 'POST', body });
      setCreated(res.client);
      setView('success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="clients" />

      <div className="flex flex-col flex-1 min-w-0">
        {view === 'form' ? (
          <>
            <PageHeader
              eyebrow="Nouveau client"
              title={
                type === 'INDIVIDUAL'
                  ? 'Enregistrer un nouveau client'
                  : 'Enregistrer une entreprise'
              }
              action={
                <button
                  type="button"
                  onClick={() => router.push('/clients')}
                  className="text-primary text-sm font-medium"
                >
                  Retour
                </button>
              }
            />

            <div className="flex-1 overflow-y-auto">
              <form onSubmit={onSubmit} className="max-w-3xl mx-auto p-6 flex flex-col gap-6">
                {type === 'INDIVIDUAL' ? (
                  <FormSection title="Informations personnelles">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                      <Field
                        label="Prénom"
                        name="firstName"
                        required
                        value={firstName}
                        onChange={setFirstName}
                        placeholder="Ex: Ibrahima"
                      />
                      <Field
                        label="Nom"
                        name="lastName"
                        required
                        value={lastName}
                        onChange={setLastName}
                        placeholder="Ex: Sow"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <PhoneField
                        label="Téléphone"
                        name="phone"
                        required
                        value={phone}
                        onChange={setPhone}
                      />
                      <Field
                        label="Email"
                        name="email"
                        type="email"
                        value={email}
                        onChange={setEmail}
                        placeholder="Ex: ibrahima@email.com"
                      />
                    </div>
                  </FormSection>
                ) : (
                  <FormSection title="Informations entreprise">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                      <Field
                        label="Raison sociale"
                        name="companyName"
                        required
                        value={companyName}
                        onChange={setCompanyName}
                        placeholder="Ex: MekaSoft Garage SARL"
                      />
                      <Field
                        label="SIRET / N° fiscal"
                        name="taxId"
                        value={taxId}
                        onChange={setTaxId}
                        placeholder="Ex: 123456789"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <PhoneField
                        label="Téléphone"
                        name="phone"
                        required
                        value={phone}
                        onChange={setPhone}
                      />
                      <Field
                        label="Email professionnel"
                        name="email"
                        type="email"
                        value={email}
                        onChange={setEmail}
                        placeholder="Ex: contact@mekasoft.com"
                      />
                    </div>
                  </FormSection>
                )}

                <FormSection title="Adresse">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                    <Field
                      label="Quartier/Rue"
                      name="street"
                      value={street}
                      onChange={setStreet}
                      placeholder="Ex: Plateau"
                    />
                    <Field
                      label="Ville"
                      name="city"
                      value={city}
                      onChange={setCity}
                      placeholder="Ex: Dakar"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <Field
                      label="Code postal"
                      name="postalCode"
                      value={postalCode}
                      onChange={setPostalCode}
                      placeholder="Ex: 13000"
                    />
                    <Field
                      label="Pays"
                      name="country"
                      value={country}
                      onChange={setCountry}
                      placeholder="Sénégal"
                    />
                  </div>
                </FormSection>

                <FormSection title="Type de client">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                    <RadioCard
                      label="Particulier"
                      selected={type === 'INDIVIDUAL'}
                      onClick={() => setType('INDIVIDUAL')}
                    />
                    <RadioCard
                      label="Entreprise"
                      selected={type === 'COMPANY'}
                      onClick={() => setType('COMPANY')}
                    />
                  </div>

                  {type === 'INDIVIDUAL' ? (
                    <div className="flex flex-col gap-5">
                      <Field
                        label="Profession / Secteur"
                        name="profession"
                        value={profession}
                        onChange={setProfession}
                        placeholder="Ex: Transporteur, Agent commercial"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <Field
                          label="Date de naissance"
                          name="dateOfBirth"
                          type="text"
                          value={dateOfBirth}
                          onChange={setDateOfBirth}
                          placeholder="JJ/MM/AAAA"
                        />
                        <Field
                          label="N° de pièce d'identité"
                          name="idNumber"
                          value={idNumber}
                          onChange={setIdNumber}
                          placeholder="Ex: 2345678901234"
                        />
                      </div>
                    </div>
                  ) : (
                    <Field
                      label="Secteur d'activité"
                      name="sector"
                      value={sector}
                      onChange={setSector}
                      placeholder="Ex: Transport, Construction"
                    />
                  )}
                </FormSection>

                {type === 'COMPANY' && (
                  <FormSection title="Contact responsable">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                      <Field
                        label="Nom du responsable"
                        name="contactName"
                        value={contactName}
                        onChange={setContactName}
                        placeholder="Ex: Sow"
                      />
                      <Field
                        label="Fonction"
                        name="contactRole"
                        value={contactRole}
                        onChange={setContactRole}
                        placeholder="Ex: Gérant, Directeur"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <PhoneField
                        label="Téléphone direct"
                        name="contactPhone"
                        value={contactPhone}
                        onChange={setContactPhone}
                      />
                      <Field
                        label="Email direct"
                        name="contactEmail"
                        type="email"
                        value={contactEmail}
                        onChange={setContactEmail}
                        placeholder="Ex: contact@email.com"
                      />
                    </div>
                  </FormSection>
                )}

                <FormSection title="Notes">
                  <Field
                    label=""
                    name="notes"
                    type="textarea"
                    value={notes}
                    onChange={setNotes}
                    placeholder={
                      type === 'INDIVIDUAL'
                        ? 'Ajouter des notes personnelles sur ce client'
                        : 'Ajouter des notes sur cette entreprise'
                    }
                  />
                </FormSection>

                <div className="bg-secondary/20 border border-secondary rounded-md px-4 py-3">
                  <div className="flex gap-2 text-sm">
                    <Icon
                      i="info"
                      size={16}
                      className="text-secondary-foreground flex-shrink-0 mt-0.5"
                    />
                    <p className="text-secondary-foreground">
                      {type === 'INDIVIDUAL'
                        ? 'Les informations de contact (téléphone, email) sont obligatoires pour créer un nouveau client.'
                        : 'Les informations de contact (téléphone, email) et la raison sociale sont obligatoires pour créer une entreprise.'}
                    </p>
                  </div>
                </div>

                {error && (
                  <p role="alert" className="text-sm text-warning">
                    {error}
                  </p>
                )}

                <div className="flex gap-3 py-4 border-t border-border">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submitting}
                    className="flex-1 justify-center"
                  >
                    <Icon i="check" size={14} />
                    {submitting
                      ? 'Création…'
                      : type === 'INDIVIDUAL'
                        ? 'Créer le client'
                        : "Créer l'entreprise"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push('/clients')}
                    className="flex-1 justify-center"
                  >
                    Annuler
                  </Button>
                </div>
              </form>
            </div>
          </>
        ) : (
          created && (
            <>
              <PageHeader
                eyebrow="Nouveau client"
                title={type === 'INDIVIDUAL' ? 'Client créé' : 'Entreprise créée'}
              />
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="max-w-md w-full flex flex-col items-center gap-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                    <Icon i="circle-check" size={32} className="text-success" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <h1 className="text-2xl font-bold font-headings text-foreground">
                      {type === 'INDIVIDUAL' ? 'Client enregistré' : 'Entreprise enregistrée'}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      {created.name} a été ajouté{type === 'COMPANY' ? 'e' : ''} à votre annuaire.
                    </p>
                  </div>

                  <div className="w-full bg-surface border border-border rounded-md p-6 text-left">
                    <div className="flex flex-col gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                          {type === 'INDIVIDUAL' ? 'Nom' : 'Raison sociale'}
                        </div>
                        <div className="text-sm font-bold text-foreground">{created.name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                          Téléphone
                        </div>
                        <div className="text-sm font-bold text-foreground">{created.phone}</div>
                      </div>
                      {created.email && (
                        <div>
                          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                            Email
                          </div>
                          <div className="text-sm font-bold text-foreground">{created.email}</div>
                        </div>
                      )}
                      {(created.street || created.city) && (
                        <div className="pt-3 border-t border-border">
                          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                            Adresse
                          </div>
                          <div className="text-sm text-foreground">
                            {[created.street, created.city, created.postalCode, created.country]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="w-full flex flex-col gap-3">
                    <Button
                      variant="primary"
                      onClick={() => router.push(`/vehicles/new?clientId=${created.id}`)}
                      className="w-full justify-center"
                    >
                      <Icon i="plus" size={14} />
                      Ajouter un véhicule
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/clients')}
                      className="w-full justify-center"
                    >
                      <Icon i="arrow-left" size={14} />
                      Retour à l&apos;annuaire
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Vous pouvez maintenant créer des interventions pour{' '}
                    {type === 'INDIVIDUAL' ? 'ce client' : 'cette entreprise'}.
                  </p>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
