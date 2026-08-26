'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import { SkeletonForm } from '@/components/ui/Skeleton';

export interface EditClientModalSavedPayload {
  id: string;
  name: string;
  phone: string;
  status: 'actif' | 'inactif';
}

export interface EditClientModalProps {
  clientId: string;
  onClose: () => void;
  onSaved: (client: EditClientModalSavedPayload) => void;
}

interface ClientDetail {
  id: string;
  type: 'INDIVIDUAL' | 'COMPANY';
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  phone: string;
  email: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  profession: string | null;
  taxId: string | null;
  sector: string | null;
  contactName: string | null;
  contactRole: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: 'actif' | 'inactif';
}

// Phase C item #6 (2026-08-25): the client profile's "Modifier" was dead
// UI — same gap EditVehicleModal closed for vehicles in Phase 4, mirrored
// closely here (lazy-fetch the full record, one flat PATCH on submit).
// `type` is read-only (see PATCH /api/clients/[id]'s header comment for
// why) — the form only renders the field set that matches the client's
// existing INDIVIDUAL/COMPANY shape. `idNumber` (encrypted at rest) is
// intentionally never pre-filled from the server — PATCH /api/clients/[id]
// doesn't return it (same omission GET already has), so this field starts
// blank and only overwrites the stored value if the user types into it.
export default function EditClientModal({ clientId, onClose, onSaved }: EditClientModalProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<'INDIVIDUAL' | 'COMPANY'>('INDIVIDUAL');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profession, setProfession] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [sector, setSector] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [idNumber, setIdNumber] = useState('');

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'actif' | 'inactif'>('actif');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const res = await api<{ client: ClientDetail }>(`/api/clients/${clientId}`);
        if (cancelled) return;
        const c = res.client;
        setType(c.type);
        setFirstName(c.firstName ?? '');
        setLastName(c.lastName ?? '');
        setProfession(c.profession ?? '');
        setCompanyName(c.companyName ?? '');
        setTaxId(c.taxId ?? '');
        setSector(c.sector ?? '');
        setContactName(c.contactName ?? '');
        setContactRole(c.contactRole ?? '');
        setContactPhone(c.contactPhone ?? '');
        setContactEmail(c.contactEmail ?? '');
        setPhone(c.phone);
        setEmail(c.email ?? '');
        setStreet(c.street ?? '');
        setCity(c.city ?? '');
        setPostalCode(c.postalCode ?? '');
        setCountry(c.country ?? '');
        setNotes(c.notes ?? '');
        setStatus(c.status);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Impossible de charger le client.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function onSubmit() {
    setError(null);
    if (!phone.trim()) {
      setError('Le téléphone est obligatoire.');
      return;
    }
    if (type === 'INDIVIDUAL' && (!firstName.trim() || !lastName.trim())) {
      setError('Prénom et nom sont obligatoires.');
      return;
    }
    if (type === 'COMPANY' && !companyName.trim()) {
      setError('La raison sociale est obligatoire.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ client: ClientDetail & { name: string } }>(
        `/api/clients/${clientId}`,
        {
          method: 'PATCH',
          body: {
            phone,
            email: email || null,
            street: street || null,
            city: city || null,
            postalCode: postalCode || null,
            country: country || null,
            notes: notes || null,
            status,
            ...(type === 'INDIVIDUAL'
              ? {
                  firstName,
                  lastName,
                  profession: profession || null,
                  ...(idNumber ? { idNumber } : {}),
                }
              : {
                  companyName,
                  taxId: taxId || null,
                  sector: sector || null,
                  contactName: contactName || null,
                  contactRole: contactRole || null,
                  contactPhone: contactPhone || null,
                  contactEmail: contactEmail || null,
                }),
          },
        },
      );
      onSaved({
        id: res.client.id,
        name: res.client.name,
        phone: res.client.phone,
        status: res.client.status,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <SkeletonForm fields={5} />;
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm text-warning">
          {loadError}
        </p>
        <Button variant="outline" onClick={onClose} className="justify-center">
          Fermer
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {type === 'INDIVIDUAL' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Prénom"
              name="firstName"
              required
              value={firstName}
              onChange={setFirstName}
            />
            <Field label="Nom" name="lastName" required value={lastName} onChange={setLastName} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Profession"
              name="profession"
              value={profession}
              onChange={setProfession}
            />
            <Field
              label="N° pièce d'identité"
              name="idNumber"
              value={idNumber}
              onChange={setIdNumber}
              placeholder="Laisser vide pour ne pas modifier"
            />
          </div>
        </>
      ) : (
        <>
          <Field
            label="Raison sociale"
            name="companyName"
            required
            value={companyName}
            onChange={setCompanyName}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="N° fiscal" name="taxId" value={taxId} onChange={setTaxId} />
            <Field label="Secteur" name="sector" value={sector} onChange={setSector} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Nom du contact"
              name="contactName"
              value={contactName}
              onChange={setContactName}
            />
            <Field
              label="Fonction du contact"
              name="contactRole"
              value={contactRole}
              onChange={setContactRole}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Téléphone du contact"
              name="contactPhone"
              value={contactPhone}
              onChange={setContactPhone}
            />
            <Field
              label="Email du contact"
              name="contactEmail"
              type="email"
              value={contactEmail}
              onChange={setContactEmail}
            />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
        <Field label="Téléphone" name="phone" required value={phone} onChange={setPhone} />
        <Field label="Email" name="email" type="email" value={email} onChange={setEmail} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Adresse" name="street" value={street} onChange={setStreet} />
        <Field label="Ville" name="city" value={city} onChange={setCity} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Code postal" name="postalCode" value={postalCode} onChange={setPostalCode} />
        <Field label="Pays" name="country" value={country} onChange={setCountry} />
      </div>
      <Field
        label="Statut"
        name="status"
        type="select"
        value={status}
        onChange={(v) => setStatus(v as 'actif' | 'inactif')}
        options={[
          { value: 'actif', label: 'Actif' },
          { value: 'inactif', label: 'Inactif' },
        ]}
      />
      <Field
        label="Notes"
        name="notes"
        type="textarea"
        value={notes}
        onChange={setNotes}
        placeholder="Ajouter des notes sur ce client"
      />

      {error && (
        <p role="alert" className="text-sm text-warning">
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={submitting}
          className="flex-1 justify-center"
        >
          Annuler
        </Button>
        <Button
          variant="primary"
          onClick={() => void onSubmit()}
          disabled={submitting}
          className="flex-1 justify-center"
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
