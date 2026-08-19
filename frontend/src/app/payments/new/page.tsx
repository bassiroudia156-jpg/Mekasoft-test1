// Ported from Banani RegisterPayment (+2 duplicate captures = same form)
// with inline conditional sections for RegisterPaymentBankTransferDetails
// / RegisterPaymentMobileMoneyDetails / RegisterPayment_next3 (Chèque) —
// one form, `method` discriminated union, not 4 routes (decision #4,
// phase-7-payments.md — this was already the stated architecture in
// STATUS.md's domain I inventory before Phase 0 started). Internal success
// view = PaymentRegisteredConfirmation, generalized to conditionally show
// whichever method-specific detail block applies; no Chèque confirmation
// variant exists in the 109 screens, extrapolated from the same shell.
'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import PageHeader from '@/components/ui/PageHeader';
import FormSection from '@/components/ui/FormSection';
import Field from '@/components/ui/Field';
import PhoneField from '@/components/ui/PhoneField';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import SearchSelect, { type SearchSelectOption } from '@/components/ui/SearchSelect';

type Method = 'Espèces' | 'Virement bancaire' | 'Mobile Money' | 'Chèque';

const METHOD_OPTIONS: { value: Method; icon: string }[] = [
  { value: 'Espèces', icon: 'banknote' },
  { value: 'Virement bancaire', icon: 'send' },
  { value: 'Mobile Money', icon: 'smartphone' },
  { value: 'Chèque', icon: 'file-text' },
];

const MOBILE_PROVIDER_OPTIONS = [
  { value: 'Orange Money', label: 'Orange Money' },
  { value: 'Wave', label: 'Wave' },
  { value: 'Free Money', label: 'Free Money' },
];

const CHEQUE_STATUS_OPTIONS = [
  { value: 'À encaisser', label: 'À encaisser' },
  { value: 'Encaissé', label: 'Encaissé' },
];

interface InvoiceOption {
  id: string;
  reference: string;
  amount: number;
  status: string;
  client: string;
}

interface InvoiceDetail {
  id: string;
  reference: string;
  amount: number;
  status: string;
  client: { id: string; name: string; phone: string };
}

interface CreatedPayment {
  id: string;
  reference: string;
  amount: number;
  method: Method;
  status: string;
  paymentDate: string;
  receiptReference: string | null;
  invoiceReference: string;
  client: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatFCFA(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function NewPaymentBody() {
  const user = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const lockedInvoiceId = params.get('invoiceId');

  const [invoiceId, setInvoiceId] = useState('');
  const [invoiceLabel, setInvoiceLabel] = useState<string | null>(null);
  const [invoiceAmount, setInvoiceAmount] = useState<number | null>(null);
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [invoiceOptions, setInvoiceOptions] = useState<SearchSelectOption[]>([]);
  const [invoiceLocked, setInvoiceLocked] = useState(!!lockedInvoiceId);
  const [alreadyPaid, setAlreadyPaid] = useState(false);

  const [clientName, setClientName] = useState<string | null>(null);
  const [clientPhone, setClientPhone] = useState('');

  const [method, setMethod] = useState<Method>('Espèces');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [generateReceipt, setGenerateReceipt] = useState(true);

  const [bankName, setBankName] = useState('');
  const [bankAccountLast4, setBankAccountLast4] = useState('');
  const [transferReference, setTransferReference] = useState('');
  const [payerName, setPayerName] = useState('');

  const [mobileProvider, setMobileProvider] = useState('Orange Money');
  const [mobilePhone, setMobilePhone] = useState('');
  const [mobileReference, setMobileReference] = useState('');

  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeBank, setChequeBank] = useState('');
  const [chequeHolder, setChequeHolder] = useState('');
  const [chequeDueDate, setChequeDueDate] = useState('');
  const [chequeStatus, setChequeStatus] = useState('À encaisser');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedPayment | null>(null);

  // Locked entry point: from an invoice's "Enregistrer un paiement" action.
  useEffect(() => {
    if (!lockedInvoiceId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ invoice: InvoiceDetail }>(`/api/invoices/${lockedInvoiceId}`);
        if (cancelled) return;
        setInvoiceId(res.invoice.id);
        setInvoiceLabel(res.invoice.reference);
        setInvoiceAmount(res.invoice.amount);
        setClientName(res.invoice.client.name);
        setClientPhone(res.invoice.client.phone);
        setAlreadyPaid(res.invoice.status === 'Payée');
      } catch {
        if (!cancelled) setInvoiceLocked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lockedInvoiceId]);

  // Invoice search-as-you-type (only when not locked) — filtered to unpaid
  // invoices client-side (no `status=unpaid` meta-filter exists server-side).
  useEffect(() => {
    if (invoiceLocked || invoiceQuery.trim().length < 2) {
      setInvoiceOptions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api<{ items: InvoiceOption[] }>(
          `/api/invoices?q=${encodeURIComponent(invoiceQuery)}&limit=8`,
        );
        if (!cancelled) {
          setInvoiceOptions(
            res.items
              .filter((i) => i.status !== 'Payée')
              .map((i) => ({
                id: i.id,
                label: i.reference,
                sublabel: `${i.client} · ${formatFCFA(i.amount)}`,
              })),
          );
        }
      } catch {
        if (!cancelled) setInvoiceOptions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [invoiceQuery, invoiceLocked]);

  if (!user) return null;

  function handleSelectInvoice(opt: SearchSelectOption) {
    setInvoiceId(opt.id);
    setInvoiceLabel(opt.label);
    setInvoiceQuery('');
    // sublabel is "{client} · {amount}" — re-fetch full detail for the
    // read-only client/amount display rather than parsing it back apart.
    void api<{ invoice: InvoiceDetail }>(`/api/invoices/${opt.id}`).then((res) => {
      setInvoiceAmount(res.invoice.amount);
      setClientName(res.invoice.client.name);
      setClientPhone(res.invoice.client.phone);
    });
  }

  function methodBody(): Record<string, unknown> {
    switch (method) {
      case 'Virement bancaire':
        return {
          bankName,
          ...(bankAccountLast4 ? { bankAccountLast4 } : {}),
          transferReference,
          ...(payerName ? { payerName } : {}),
        };
      case 'Mobile Money':
        return {
          mobileProvider,
          ...(mobilePhone ? { mobilePhone } : {}),
          mobileReference,
        };
      case 'Chèque':
        return {
          chequeNumber,
          chequeBank,
          ...(chequeHolder ? { chequeHolder } : {}),
          chequeDueDate,
          chequeStatus,
        };
      default:
        return {};
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!invoiceId) {
      setError('Sélectionnez une facture.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ payment: CreatedPayment }>('/api/payments', {
        method: 'POST',
        body: {
          invoiceId,
          method,
          paymentDate,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          generateReceipt,
          ...methodBody(),
        },
      });
      setCreated(res.payment);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVOICE_ALREADY_PAID') {
        setError('Cette facture est déjà payée.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setCreated(null);
    setInvoiceId('');
    setInvoiceLabel(null);
    setInvoiceAmount(null);
    setClientName(null);
    setClientPhone('');
    setMethod('Espèces');
    setPaymentDate(todayIso());
    setNotes('');
    setGenerateReceipt(true);
    setBankName('');
    setBankAccountLast4('');
    setTransferReference('');
    setPayerName('');
    setMobileProvider('Orange Money');
    setMobilePhone('');
    setMobileReference('');
    setChequeNumber('');
    setChequeBank('');
    setChequeHolder('');
    setChequeDueDate('');
    setChequeStatus('À encaisser');
  }

  return (
    <div className="flex bg-background min-h-screen">
      <Sidebar active="payments" />

      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader
          eyebrow={created ? 'Paiement enregistré' : 'Nouveau paiement'}
          title={created ? 'La transaction a été enregistrée' : 'Enregistrer un paiement'}
          action={
            !created && (
              <button
                type="button"
                onClick={() => router.push('/payments?cancelled=1')}
                className="text-primary text-sm font-medium"
              >
                Fermer
              </button>
            )
          }
        />

        <div className="flex-1 overflow-y-auto flex flex-col items-center p-6">
          {created ? (
            <div className="max-w-2xl w-full flex flex-col gap-6">
              <div className="flex flex-col items-center text-center gap-4 mb-2">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-success/10">
                  <Icon i="circle-check" size={32} className="text-success" />
                </div>
                <div>
                  <h2 className="text-xl font-bold font-headings text-foreground">
                    Paiement enregistré
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    La transaction a été enregistrée avec succès
                  </p>
                </div>
              </div>

              <div className="bg-surface rounded-md border border-border p-6 space-y-4">
                <div className="flex items-start justify-between pb-4 border-b border-border">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                      N° de paiement
                    </p>
                    <p className="text-lg font-bold text-foreground">{created.reference}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                      Date
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {new Date(created.paymentDate).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                      Facture
                    </p>
                    <p className="text-sm font-bold text-foreground">{created.invoiceReference}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                      Client
                    </p>
                    <p className="text-sm font-bold text-foreground">{created.client}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                      Montant
                    </p>
                    <p className="text-lg font-bold text-success">{formatFCFA(created.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                      Méthode
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Icon
                        i={
                          METHOD_OPTIONS.find((m) => m.value === created.method)?.icon ?? 'banknote'
                        }
                        size={14}
                        className="text-muted-foreground"
                      />
                      <p className="text-sm font-bold text-foreground">{created.method}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-primary/10 border border-primary/20 rounded-md px-4 py-3 flex gap-3">
                <Icon i="info" size={14} className="text-primary shrink-0 mt-0.5" />
                <div className="text-xs text-primary">
                  <p className="font-medium mb-1">Mise à jour de la facture</p>
                  <p>La facture {created.invoiceReference} a été marquée comme payée.</p>
                </div>
              </div>

              {created.receiptReference && (
                <div className="flex items-center gap-3 bg-surface rounded-md border border-border p-4">
                  <Icon i="file-text" size={16} className="text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                      Reçu généré
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {created.receiptReference}
                    </p>
                  </div>
                  <a
                    href={`/api/payments/${created.id}/receipt/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary text-xs font-medium flex items-center gap-1"
                  >
                    <Icon i="download" size={12} />
                    Télécharger
                  </a>
                </div>
              )}

              <div className="flex flex-col gap-3 pt-2">
                <Button variant="primary" onClick={() => router.push('/payments')}>
                  <Icon i="arrow-right" size={14} />
                  Retour à la liste des paiements
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  <Icon i="plus" size={14} />
                  Enregistrer un autre paiement
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="max-w-2xl w-full flex flex-col gap-6">
              <FormSection title="Facture & client">
                {invoiceLocked && invoiceLabel ? (
                  <div className="bg-secondary/10 border border-secondary rounded-md p-4">
                    <div className="text-sm font-medium text-secondary-foreground">
                      Paiement pour la facture <span className="font-bold">{invoiceLabel}</span>
                    </div>
                    {alreadyPaid && (
                      <div className="text-xs text-warning mt-1">Cette facture est déjà payée.</div>
                    )}
                  </div>
                ) : (
                  <SearchSelect
                    label="Facture"
                    name="invoiceSearch"
                    required
                    placeholder="Chercher une facture non payée…"
                    query={invoiceQuery}
                    onQueryChange={setInvoiceQuery}
                    options={invoiceOptions}
                    selectedLabel={invoiceLabel}
                    onSelect={handleSelectInvoice}
                    onClear={() => {
                      setInvoiceId('');
                      setInvoiceLabel(null);
                      setInvoiceAmount(null);
                      setClientName(null);
                    }}
                  />
                )}

                {clientName && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Client</div>
                      <div className="text-sm font-medium text-foreground">{clientName}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Montant</div>
                      <div className="text-sm font-bold text-foreground">
                        {invoiceAmount !== null ? formatFCFA(invoiceAmount) : '—'}
                      </div>
                    </div>
                  </div>
                )}
              </FormSection>

              <FormSection title="Détails du paiement">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <Field
                    label="Date du paiement"
                    name="paymentDate"
                    type="date"
                    required
                    value={paymentDate}
                    onChange={setPaymentDate}
                  />
                </div>

                <div className="space-y-2 mb-4">
                  <label className="text-sm font-medium text-foreground">
                    Méthode de paiement<span className="text-accent ml-1">*</span>
                  </label>
                  <div className="border border-border rounded-md bg-input overflow-hidden">
                    {METHOD_OPTIONS.map((opt, idx) => (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${idx > 0 ? 'border-t border-border' : ''}`}
                      >
                        <input
                          type="radio"
                          name="method"
                          checked={method === opt.value}
                          onChange={() => setMethod(opt.value)}
                          className="w-4 h-4"
                        />
                        <Icon i={opt.icon} size={16} className="text-muted-foreground" />
                        <span className="text-sm text-foreground">{opt.value}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {method === 'Virement bancaire' && (
                  <div className="space-y-4 mb-4 pt-4 border-t border-border">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field
                        label="Banque"
                        name="bankName"
                        required
                        value={bankName}
                        onChange={setBankName}
                        placeholder="Ex: SGBS (Banque Sénégalaise)"
                      />
                      <Field
                        label="Compte débité (4 derniers chiffres)"
                        name="bankAccountLast4"
                        value={bankAccountLast4}
                        onChange={setBankAccountLast4}
                        placeholder="5678"
                      />
                    </div>
                    <Field
                      label="Référence de virement"
                      name="transferReference"
                      required
                      value={transferReference}
                      onChange={setTransferReference}
                      placeholder="Ex: VIR-2025-05-15-1234"
                    />
                    <Field
                      label="Nom du payeur"
                      name="payerName"
                      value={payerName}
                      onChange={setPayerName}
                      placeholder={clientName ?? ''}
                      helper="Laisser vide pour utiliser le nom du client"
                    />
                  </div>
                )}

                {method === 'Mobile Money' && (
                  <div className="space-y-4 mb-4 pt-4 border-t border-border">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field
                        label="Opérateur"
                        name="mobileProvider"
                        type="select"
                        required
                        value={mobileProvider}
                        onChange={setMobileProvider}
                        options={MOBILE_PROVIDER_OPTIONS}
                      />
                      <PhoneField
                        label="Numéro de téléphone"
                        name="mobilePhone"
                        value={mobilePhone}
                        onChange={setMobilePhone}
                        helper={
                          clientPhone
                            ? `Laisser vide pour utiliser celui du client (${clientPhone})`
                            : 'Laisser vide pour utiliser le numéro du client'
                        }
                      />
                    </div>
                    <Field
                      label="Référence de transaction"
                      name="mobileReference"
                      required
                      value={mobileReference}
                      onChange={setMobileReference}
                      placeholder="Ex: OM-2025-05-15-12345"
                    />
                    <div className="bg-primary/10 border border-primary/20 rounded-md px-4 py-3">
                      <div className="flex gap-2 text-xs">
                        <Icon i="info" size={14} className="text-primary shrink-0 mt-0.5" />
                        <p className="text-primary">
                          Assurez-vous que la référence de transaction correspond à celle reçue du
                          client.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {method === 'Chèque' && (
                  <div className="space-y-4 mb-4 pt-4 border-t border-border">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field
                        label="Numéro de chèque"
                        name="chequeNumber"
                        required
                        value={chequeNumber}
                        onChange={setChequeNumber}
                        placeholder="Ex: 0001234567"
                      />
                      <Field
                        label="Banque"
                        name="chequeBank"
                        required
                        value={chequeBank}
                        onChange={setChequeBank}
                        placeholder="Ex: SGBS (Banque Sénégalaise)"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field
                        label="Titulaire du chèque"
                        name="chequeHolder"
                        value={chequeHolder}
                        onChange={setChequeHolder}
                        placeholder={clientName ?? ''}
                        helper="Laisser vide pour utiliser le nom du client"
                      />
                      <Field
                        label="Statut"
                        name="chequeStatus"
                        type="select"
                        required
                        value={chequeStatus}
                        onChange={setChequeStatus}
                        options={CHEQUE_STATUS_OPTIONS}
                      />
                    </div>
                    <Field
                      label="Date d'échéance"
                      name="chequeDueDate"
                      type="date"
                      required
                      value={chequeDueDate}
                      onChange={setChequeDueDate}
                    />
                  </div>
                )}

                <Field
                  label="Notes (optionnel)"
                  name="notes"
                  type="textarea"
                  value={notes}
                  onChange={setNotes}
                  placeholder="Référence de transaction, détails supplémentaires…"
                />

                <div className="bg-background rounded-md p-4 border border-border mt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generateReceipt}
                      onChange={(e) => setGenerateReceipt(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-foreground">Générer un reçu</span>
                  </label>
                </div>
              </FormSection>

              {error && (
                <p role="alert" className="text-sm text-warning">
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-3 pt-4 border-t border-border">
                <Button type="submit" variant="primary" disabled={submitting || alreadyPaid}>
                  <Icon i="check" size={14} />
                  {submitting ? 'Enregistrement…' : 'Enregistrer le paiement'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/payments?cancelled=1')}
                  disabled={submitting}
                >
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

export default function NewPaymentPage() {
  return (
    <Suspense fallback={null}>
      <NewPaymentBody />
    </Suspense>
  );
}
