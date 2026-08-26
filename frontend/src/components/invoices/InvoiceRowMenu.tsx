import RowMenu from '@/components/ui/RowMenu';

export interface InvoiceRowMenuProps {
  onDownloadPdf: () => void;
  onPrint: () => void;
  onResend: () => void;
  onViewDetails: () => void;
  onDelete: () => void;
}

// Banani's InvoicesListContextMenu designed 5 concrete actions for the row
// "..." button. Built on the shared RowMenu primitive (2026-08-18: this
// row menu, plus the vehicle and payment ones, all sat inside a
// horizontally-scrolling table wrapper — an `absolute`-positioned panel
// got clipped and the ancestor grew its own scrollbar instead of showing
// the menu; RowMenu portals the panel to `document.body` to escape that
// entirely — see its own header comment).
export default function InvoiceRowMenu({
  onDownloadPdf,
  onPrint,
  onResend,
  onViewDetails,
  onDelete,
}: InvoiceRowMenuProps) {
  return (
    <RowMenu
      width={224}
      items={[
        { key: 'pdf', label: 'Télécharger PDF', icon: 'download', onClick: onDownloadPdf },
        { key: 'print', label: 'Imprimer', icon: 'printer', onClick: onPrint },
        { key: 'resend', label: 'Renvoyer par email', icon: 'send', onClick: onResend },
        { key: 'details', label: 'Voir les détails', icon: 'eye', onClick: onViewDetails },
        {
          key: 'delete',
          label: 'Supprimer',
          icon: 'trash-2',
          onClick: onDelete,
          tone: 'destructive',
          separatorBefore: true,
        },
      ]}
    />
  );
}
