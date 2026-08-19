'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Field from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

// Banani InvoiceResendEmail → InvoiceEmailSent — one Modal, two internal
// views (form/sent), same pattern as TeamManagementModal. Reachable from
// both the list's row menu and the detail page's "Renvoyer" button
// (decision from phase-6-invoices.md structure map, item 5).
export interface ResendInvoiceModalProps {
  invoiceId: string;
  invoiceReference: string;
  clientEmail: string | null;
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}

export default function ResendInvoiceModal({
  invoiceId,
  invoiceReference,
  clientEmail,
  open,
  onClose,
  onSent,
}: ResendInvoiceModalProps) {
  const [view, setView] = useState<'form' | 'sent'>('form');
  const [to, setTo] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState('');

  useEffect(() => {
    if (open) {
      setView('form');
      setTo(clientEmail ?? '');
      setCustomMessage('');
      setError(null);
    }
  }, [open, clientEmail]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ ok: true; to: string }>(`/api/invoices/${invoiceId}/resend`, {
        method: 'POST',
        body: {
          ...(to ? { to } : {}),
          ...(customMessage.trim() ? { customMessage: customMessage.trim() } : {}),
        },
      });
      setSentTo(res.to);
      setView('sent');
      onSent?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CLIENT_HAS_NO_EMAIL') {
        setError("Ce client n'a pas d'adresse email enregistrée — saisissez-en une ci-dessus.");
      } else {
        setError(err instanceof ApiError ? err.message : 'Erreur inconnue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="md">
      {view === 'form' ? (
        <div>
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
              <Icon i="send" size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-headings text-foreground">
                Renvoyer la facture
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Facture {invoiceReference}</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field
              label="Adresse email"
              name="to"
              type="email"
              required
              value={to}
              onChange={setTo}
              placeholder="client@example.com"
            />
            <Field
              label="Message personnalisé (optionnel)"
              name="customMessage"
              type="textarea"
              value={customMessage}
              onChange={setCustomMessage}
              placeholder="Laisser vide pour utiliser le message par défaut…"
            />

            {error && (
              <p role="alert" className="text-xs text-warning">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 justify-center"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                className="flex-1 justify-center"
              >
                {submitting ? 'Envoi…' : 'Envoyer'}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div>
          <div className="flex justify-center mb-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-success/10">
              <Icon i="circle-check" size={32} className="text-success" />
            </div>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-lg font-bold font-headings text-foreground mb-2">
              Facture envoyée
            </h2>
            <p className="text-xs text-muted-foreground">
              La facture {invoiceReference} a été envoyée à {sentTo}.
            </p>
          </div>

          <Button variant="primary" onClick={onClose} className="w-full justify-center">
            Fermer
          </Button>
        </div>
      )}
    </Modal>
  );
}
