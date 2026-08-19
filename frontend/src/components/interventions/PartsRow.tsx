import Icon from '@/components/ui/Icon';

// Audit fix (2026-08-17): Banani's mock shows a row-select checkbox and
// +/-  quantity steppers, but neither page ever implements a bulk action
// or an in-place quantity edit — both were always dead UI (`selected`/
// `onToggleSelect`/`onIncrement`/`onDecrement` had zero real callers in
// the whole codebase, confirmed via grep). Worse, the checkbox was a
// *controlled* input (`checked={selected}`) with no `onChange`, which is
// exactly the kind of bug this project has flagged before ('Modifier'/
// 'Archiver' buttons dropped for the same reason, see interventions/[id]/
// page.tsx's header comment) — React throws a real `console.error` for a
// checked input with no onChange, on every single row, every render. That
// console.error is what surfaces as Next's dev-overlay "1 issue" badge —
// not a sign the part failed to save (see STATUS.md for the full repro).
// Removed both dead affordances rather than half-wiring them; quantity is
// still shown, just no longer editable inline (no consumer needs it to be).
export interface PartsRowProps {
  reference: string;
  name: string;
  supplier: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  total: string;
  inStock: boolean;
  onDelete?: () => void;
}

export default function PartsRow({
  reference,
  name,
  supplier,
  quantity,
  unit,
  unitPrice,
  total,
  inStock,
  onDelete,
}: PartsRowProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-surface">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{name}</div>
        <div className="text-xs text-muted-foreground">REF: {reference}</div>
      </div>

      <div className="text-xs text-muted-foreground w-32 shrink-0 truncate">{supplier}</div>

      <div className="flex items-center gap-1 w-24 shrink-0">
        <span className="text-sm font-medium text-foreground">{quantity}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>

      <div className="text-sm text-muted-foreground w-24 text-right shrink-0">{unitPrice}</div>
      <div className="text-sm font-bold text-foreground w-28 text-right shrink-0">{total}</div>

      <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs w-20 shrink-0">
        <div className={`w-1.5 h-1.5 rounded-full ${inStock ? 'bg-success' : 'bg-warning'}`} />
        <span className={inStock ? 'text-success' : 'text-warning'}>
          {inStock ? 'Stock' : 'Cmd.'}
        </span>
      </div>

      <button
        type="button"
        onClick={onDelete}
        aria-label={`Retirer ${name}`}
        className="text-muted-foreground hover:text-accent w-6 h-6 flex items-center justify-center shrink-0"
      >
        <Icon i="trash-2" size={14} />
      </button>
    </div>
  );
}
