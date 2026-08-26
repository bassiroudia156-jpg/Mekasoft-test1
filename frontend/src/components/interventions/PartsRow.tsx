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
//
// 2026-08-24 fix — moved from a flex row to CSS Grid, and exported the
// header as PartsRowHeader below sharing the SAME column template. This
// row and its header used to be two independently hand-widthed layouts in
// two different files (this component + interventions/new/page.tsx's own
// header markup) — they drifted out of sync twice: once when a leftover
// header spacer (for the checkbox column removed above) shifted every
// label ~36px right of its data, and again when the flex row's `flex-1`
// name/ref column grew wide enough at some widths to visually collide
// with the "Fournisseur" column instead of sitting cleanly beside it.
// Grid's `grid-template-columns` has neither failure mode — column widths
// come from one template, not from two files agreeing on matching
// `w-*`/`flex-1` classes.
//
// 2026-08-24 follow-up — the fixed tracks used to include a `minmax(0,1fr)`
// name column: with no floor, on a viewport narrower than the fixed tracks'
// total it computed to (near) 0 and rendered as a single stray glyph
// colliding with "Fournisseur" (interventions/new/page.tsx hit this twice —
// once with no min-width wrapper at all, once with a wrapper whose value was
// still narrower than the row's true minimum content width). Wrapping in
// `overflow-x-auto` is necessary but NOT sufficient on its own — a `1fr`
// track with no floor will still collapse toward 0 before that scroll
// container ever kicks in. Fixed with two changes: the name column now has
// a real floor (`minmax(9rem,1fr)`, below), and the Stock column was
// dropped entirely (2026-08-24, on request — it wasn't earning its ~6rem of
// the budget).
//
// The row's true minimum content width (all tracks at their floor, plus 5
// gaps + px-4 padding) is 9+8+6+6+7+1.5 = 37.5rem of tracks + 5rem of gaps +
// 2rem of padding = 44.5rem = 712px. ANY page rendering PartsRowHeader/
// PartsRow MUST wrap them in
// `<div className="overflow-x-auto"><div className="min-w-[720px] ...">`
// (see interventions/[id]/page.tsx) — round UP from 712px, never down, or
// you're back to the same collapse. `truncate` on the header labels below is
// a second line of defense, not a substitute for the wrapper.
const GRID_COLS = 'grid grid-cols-[minmax(9rem,1fr)_8rem_6rem_6rem_7rem_1.5rem] items-center gap-4';

/** Column header row — same GRID_COLS template as PartsRow itself, so the
 * two can never drift apart again. Render once above a list of PartsRow,
 * inside a `min-w-[720px]` wrapper under `overflow-x-auto` (see file header
 * comment) — never bare. */
export function PartsRowHeader() {
  return (
    <div
      className={`${GRID_COLS} px-4 py-2.5 border-b border-border text-xs font-medium uppercase tracking-widest text-muted-foreground`}
    >
      <div className="truncate">Pièce</div>
      <div className="truncate">Fournisseur</div>
      <div className="truncate">Quantité</div>
      <div className="text-right">P.U.</div>
      <div className="text-right">Total</div>
      <div />
    </div>
  );
}

export interface PartsRowProps {
  reference: string;
  name: string;
  supplier: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  total: string;
  onDelete?: () => void;
  /** Hides the delete button entirely — e.g. once the parent intervention
   * is already invoiced (2026-08-24), where the API rejects the DELETE
   * anyway; a visible-but-inert trash icon there would be misleading. */
  readOnly?: boolean;
}

export default function PartsRow({
  reference,
  name,
  supplier,
  quantity,
  unit,
  unitPrice,
  total,
  onDelete,
  readOnly = false,
}: PartsRowProps) {
  return (
    <div className={`${GRID_COLS} px-4 py-3 border-b border-border bg-surface`}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{name}</div>
        <div className="text-xs text-muted-foreground truncate">REF: {reference}</div>
      </div>

      <div className="text-xs text-muted-foreground truncate">{supplier}</div>

      <div className="flex items-center gap-1">
        <span className="text-sm font-medium text-foreground">{quantity}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>

      <div className="text-sm text-muted-foreground text-right">{unitPrice}</div>
      <div className="text-sm font-bold text-foreground text-right">{total}</div>

      {!readOnly && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Retirer ${name}`}
          className="text-muted-foreground hover:text-accent w-6 h-6 flex items-center justify-center justify-self-center"
        >
          <Icon i="trash-2" size={14} />
        </button>
      )}
    </div>
  );
}
