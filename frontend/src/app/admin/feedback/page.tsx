'use client';

// /admin/feedback — one-way product feedback list with a "traité" toggle.
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import AdminTopBar from '@/components/admin/AdminTopBar';
import { SkeletonTable } from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

interface FeedbackRow {
  id: string;
  message: string;
  rating: number | null;
  reviewed: boolean;
  createdAt: string;
}

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Icon
          key={i}
          i="star"
          size={13}
          className={i < rating ? 'text-warning fill-warning' : 'text-muted'}
        />
      ))}
    </div>
  );
}

export default function AdminFeedbackPage() {
  const { toast: showToast } = useToast();
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [reviewedFilter, setReviewedFilter] = useState('');

  const load = useCallback(() => {
    setRows(null);
    const params = new URLSearchParams();
    if (reviewedFilter) params.set('reviewed', reviewedFilter);
    api<{ feedback: FeedbackRow[] }>(`/api/admin/feedback?${params.toString()}`)
      .then((res) => setRows(res.feedback))
      .catch(() => setRows([]));
  }, [reviewedFilter]);

  useEffect(load, [load]);

  async function toggleReviewed(row: FeedbackRow) {
    try {
      await api(`/api/admin/feedback/${row.id}`, {
        method: 'PATCH',
        body: { reviewed: !row.reviewed },
      });
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec de la mise à jour.', 'error');
    }
  }

  return (
    <>
      <AdminTopBar title="Feedback" subtitle="Avis et suggestions des utilisateurs" />
      <div className="flex flex-col gap-4 p-6">
        <select
          value={reviewedFilter}
          onChange={(e) => setReviewedFilter(e.target.value)}
          className="px-3 py-2 border border-border rounded-md text-sm bg-input max-w-xs"
        >
          <option value="">Tous</option>
          <option value="false">Non traité</option>
          <option value="true">Traité</option>
        </select>

        <div className="bg-surface border border-border rounded-lg p-6">
          {!rows ? (
            <SkeletonTable rows={6} cols={4} />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Aucun avis pour le moment.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {rows.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <Stars rating={row.rating} />
                    <div className="text-sm text-foreground mt-1">{row.message}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(row.createdAt).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge tone={row.reviewed ? 'success' : 'muted'}>
                      {row.reviewed ? 'Traité' : 'Non traité'}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => void toggleReviewed(row)}>
                      {row.reviewed ? 'Marquer non traité' : 'Marquer traité'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
