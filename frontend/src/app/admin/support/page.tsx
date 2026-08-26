'use client';

// /admin/support — ticket inbox. Reply sends a real email (EmailQueue) and
// moves the ticket to IN_PROGRESS/RESOLVED — see support-tickets/[id]/route.ts.
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import AdminTopBar from '@/components/admin/AdminTopBar';
import { SkeletonTable } from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import SlideOver from '@/components/ui/SlideOver';
import Icon from '@/components/ui/Icon';

interface TicketRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
}

const STATUS_TONE: Record<string, 'warning' | 'primary' | 'success'> = {
  OPEN: 'warning',
  IN_PROGRESS: 'primary',
  RESOLVED: 'success',
};
const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
};

export default function AdminSupportPage() {
  const { toast: showToast } = useToast();
  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<TicketRow | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    api<{ tickets: TicketRow[] }>(`/api/admin/support-tickets?${params.toString()}`)
      .then((res) => setRows(res.tickets))
      .catch(() => setRows([]));
  }, [statusFilter]);

  useEffect(load, [load]);

  async function sendReply() {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/api/admin/support-tickets/${selected.id}`, {
        method: 'PATCH',
        body: { reply: reply.trim() || undefined, status: 'RESOLVED' },
      });
      showToast('Réponse envoyée.', 'success');
      setSelected(null);
      setReply('');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Échec de l'envoi.", 'error');
    } finally {
      setBusy(false);
    }
  }

  async function markStatus(status: 'IN_PROGRESS' | 'RESOLVED') {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/api/admin/support-tickets/${selected.id}`, { method: 'PATCH', body: { status } });
      showToast('Statut mis à jour.', 'success');
      setSelected({ ...selected, status });
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec de la mise à jour.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminTopBar title="Support" subtitle="Demandes des utilisateurs" />
      <div className="flex flex-col gap-4 p-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-border rounded-md text-sm bg-input max-w-xs"
        >
          <option value="">Tous les statuts</option>
          <option value="OPEN">Ouvert</option>
          <option value="IN_PROGRESS">En cours</option>
          <option value="RESOLVED">Résolu</option>
        </select>

        <div className="bg-surface border border-border rounded-lg p-6">
          {!rows ? (
            <SkeletonTable rows={6} cols={4} />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Aucun ticket.</div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    setSelected(row);
                    setReply('');
                  }}
                  className="flex items-center justify-between gap-4 py-4 text-left hover:bg-secondary -mx-6 px-6"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {row.subject}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.name} · {row.email}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge tone={STATUS_TONE[row.status] ?? 'muted'}>
                      {STATUS_LABEL[row.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <SlideOver open={Boolean(selected)} onClose={() => setSelected(null)}>
        {selected && (
          <div className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold font-headings text-foreground">Ticket</h2>
              <button type="button" onClick={() => setSelected(null)} aria-label="Fermer">
                <Icon i="x" size={18} className="text-muted-foreground" />
              </button>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">{selected.subject}</div>
              <div className="text-xs text-muted-foreground">
                {selected.name} · {selected.email}
              </div>
              <Badge tone={STATUS_TONE[selected.status] ?? 'muted'} className="mt-2">
                {STATUS_LABEL[selected.status]}
              </Badge>
            </div>
            <div className="bg-secondary rounded-md p-4 text-sm text-secondary-foreground whitespace-pre-wrap">
              {selected.message}
            </div>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Écrire une réponse par email…"
              rows={5}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-input"
            />
            <div className="flex flex-wrap gap-2 justify-end">
              {selected.status !== 'IN_PROGRESS' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void markStatus('IN_PROGRESS')}
                >
                  Marquer en cours
                </Button>
              )}
              {selected.status !== 'RESOLVED' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void markStatus('RESOLVED')}
                >
                  Marquer résolu
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                disabled={busy || !reply.trim()}
                onClick={() => void sendReply()}
              >
                Envoyer la réponse
              </Button>
            </div>
          </div>
        )}
      </SlideOver>
    </>
  );
}
