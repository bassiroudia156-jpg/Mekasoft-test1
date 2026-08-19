import { useState } from 'react';
import Field from './Field';
import Icon from './Icon';

export interface SearchSelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

export interface SearchSelectProps {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  query: string;
  onQueryChange: (value: string) => void;
  options: SearchSelectOption[];
  selectedLabel: string | null;
  onSelect: (option: SearchSelectOption) => void;
  onClear: () => void;
}

// Search-as-you-type combobox — third occurrence of this exact pattern
// (client search in /vehicles/new, client + client-scoped vehicle search
// in /interventions/new), extracted per the rule-of-three guidance. The
// caller owns the debounced fetch and the selected entity; this component
// only renders the input, the dropdown, and the "selected" display state.
//
// Focus-tracked ("menu roulant" behavior): the option list only shows while
// the input is focused, and callers can pre-populate `options` with a
// default page (no query typed yet) so clicking the field immediately shows
// a scrollable list to pick from — not just after typing 2+ characters.
// `onMouseDown` + `preventDefault()` on each option keeps the input focused
// through the click so `onBlur` doesn't close the list before `onSelect`
// fires (standard combobox pattern). A trailing chevron (rotates when open,
// same visual language as Field's native <select>) makes the "this is a
// dropdown" affordance explicit — added 2026-08-18 per user request that
// client/vehicle pickers on /interventions/new read clearly as a menu
// déroulant. The option panel itself opens with a short fade+slide
// (`.animate-dropdown-in`, globals.css).
export default function SearchSelect({
  label,
  name,
  required = false,
  placeholder,
  query,
  onQueryChange,
  options,
  selectedLabel,
  onSelect,
  onClear,
}: SearchSelectProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="relative">
      <Field
        label={label}
        name={name}
        required={required}
        value={selectedLabel ?? query}
        onChange={(v) => {
          if (selectedLabel) onClear();
          onQueryChange(v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="pr-8"
        {...(placeholder !== undefined ? { placeholder } : {})}
      />
      <Icon
        i="chevron-down"
        size={14}
        className={`pointer-events-none absolute right-3 bottom-[11px] text-muted-foreground transition-transform duration-200 ${
          focused ? 'rotate-180' : ''
        }`}
      />
      {focused && options.length > 0 && !selectedLabel && (
        <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-md shadow-lg overflow-hidden max-h-56 overflow-y-auto animate-dropdown-in">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(opt)}
              className="w-full flex flex-col text-left px-3 py-2 text-sm text-foreground hover:bg-input"
            >
              <span>{opt.label}</span>
              {opt.sublabel && (
                <span className="text-xs text-muted-foreground">{opt.sublabel}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
