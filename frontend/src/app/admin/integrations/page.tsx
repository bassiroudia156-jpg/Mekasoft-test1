'use client';

// /admin/integrations — read-only status of every external provider (GET
// /api/admin/integrations). No credentials editor here on purpose — see
// that route's file comment.
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import AdminTopBar from '@/components/admin/AdminTopBar';
import { SkeletonTable } from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';
import Icon from '@/components/ui/Icon';

interface IntegrationStatus {
  id: string;
  label: string;
  configured: boolean;
  healthy: boolean | null;
  detail: string;
}

export default function AdminIntegrationsPage() {
  const [rows, setRows] = useState<IntegrationStatus[] | null>(null);

  useEffect(() => {
    api<{ integrations: IntegrationStatus[] }>('/api/admin/integrations')
      .then((res) => setRows(res.integrations))
      .catch(() => setRows([]));
  }, []);

  return (
    <>
      <AdminTopBar title="Intégrations" subtitle="Statut des services externes connectés" />
      <div className="p-6">
        <div className="bg-surface border border-border rounded-lg p-6">
          {!rows ? (
            <SkeletonTable rows={6} cols={3} />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {rows.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-md flex items-center justify-center ${
                        row.configured ? 'bg-success/10' : 'bg-muted'
                      }`}
                    >
                      <Icon
                        i={row.configured ? 'check' : 'x'}
                        size={16}
                        className={row.configured ? 'text-success' : 'text-muted-foreground'}
                      />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{row.label}</div>
                      <div className="text-xs text-muted-foreground">{row.detail}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.healthy !== null && (
                      <Badge tone={row.healthy ? 'success' : 'warning'}>
                        {row.healthy ? 'Connexion OK' : 'Connexion échouée'}
                      </Badge>
                    )}
                    <Badge tone={row.configured ? 'success' : 'muted'}>
                      {row.configured ? 'Configuré' : 'Non configuré'}
                    </Badge>
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
