'use client';

import { useState, type KeyboardEvent } from 'react';
import FormSection from '@/components/ui/FormSection';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

export interface NewPart {
  reference?: string;
  name: string;
  supplier?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  inStock: boolean;
}

export interface AddPartFormProps {
  title?: string;
  onAdd: (part: NewPart) => void;
}

const UNIT_OPTIONS = [
  { value: 'pcs', label: 'pcs' },
  { value: 'set', label: 'set' },
  { value: 'L', label: 'L' },
  { value: 'kg', label: 'kg' },
];

// Ported from Banani AddParts/AddAnotherPart's "Ajouter une nouvelle
// pièce" mini-form — identical field set in both places it's used
// (creating an intervention with local parts, adding a part to an
// existing one). The caller decides what happens on add (append to a
// local array, or POST immediately).
export default function AddPartForm({
  title = 'Ajouter une nouvelle pièce',
  onAdd,
}: AddPartFormProps) {
  const [reference, setReference] = useState('');
  const [name, setName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const qty = Number(quantity);
    const price = Number(unitPrice);
    if (!name.trim()) {
      setError('Dénomination requise.');
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      setError('Quantité invalide.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Prix unitaire invalide.');
      return;
    }
    setError(null);
    onAdd({
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      name: name.trim(),
      ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
      quantity: qty,
      unit,
      unitPrice: price,
      inStock: true,
    });
    setReference('');
    setName('');
    setSupplier('');
    setQuantity('1');
    setUnitPrice('');
  }

  // Audit fix (2026-08-17): on /interventions/new this mini-form is nested
  // inside the outer intervention-creation <form> (Field's inputs are plain
  // <input>s, no onKeyDown of their own) — pressing Enter after typing the
  // last field (e.g. "Prix unitaire") submitted the OUTER form instead of
  // adding the part to the list, silently dropping whatever was typed here.
  // Intercepting Enter and routing it to handleAdd() fixes that regardless
  // of whether a caller wraps this in a <form> at all (on /interventions/
  // [id] there's no outer form, so this is a pure UX add: Enter now
  // completes "Ajouter à la liste" like it would in a search box). Select
  // is excluded — Enter there is native dropdown navigation, not a submit.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter') return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'SELECT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    handleAdd();
  }

  return (
    <FormSection title={title}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4" onKeyDown={handleKeyDown}>
        <Field
          label="Référence"
          name="partReference"
          value={reference}
          onChange={setReference}
          placeholder="Ex: HUO-2891"
        />
        <Field
          label="Dénomination"
          name="partName"
          required
          value={name}
          onChange={setName}
          placeholder="Filtre à huile…"
        />
        <Field
          label="Fournisseur"
          name="partSupplier"
          value={supplier}
          onChange={setSupplier}
          placeholder="Auto Parts…"
        />
        <Field
          label="Quantité"
          name="partQuantity"
          type="number"
          value={quantity}
          onChange={setQuantity}
          placeholder="1"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end" onKeyDown={handleKeyDown}>
        <Field
          label="Prix unitaire (CFA)"
          name="partUnitPrice"
          type="number"
          value={unitPrice}
          onChange={setUnitPrice}
          placeholder="Ex: 8500"
        />
        <Field
          label="Unité"
          name="partUnit"
          type="select"
          value={unit}
          onChange={setUnit}
          options={UNIT_OPTIONS}
        />
        <Button type="button" variant="primary" onClick={handleAdd} className="justify-center">
          <Icon i="plus" size={14} />
          Ajouter à la liste
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-warning mt-2">
          {error}
        </p>
      )}
    </FormSection>
  );
}
