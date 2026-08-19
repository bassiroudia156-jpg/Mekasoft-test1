'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  AsYouType,
  parsePhoneNumberFromString,
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from 'libphonenumber-js/min';
import Icon from './Icon';

// Audit request (2026-08-18): "un sélecteur de pays [...] et selon le pays
// que je vais choisir [...] il va me demander le format [...] et même si je
// colle le numéro il doit automatiquement détecter le format et appliquer le
// format de numéro [...] le backend l'API doit l'accepter" — a country
// selector + as-you-type national formatting + paste auto-detection, all
// converging on a clean E.164 string. `zPhone` (lib/server/zod-helpers.ts,
// PROTECTED) already accepts any valid E.164 number
// (`/^\+\d{8,15}$/`) regardless of country — it never needed a backend
// change, only a frontend that reliably PRODUCES E.164 instead of asking
// the user to type it by hand. `value`/`onChange` here carry that E.164
// string directly, so every existing `const [phone, setPhone] = useState('')`
// call site swaps in this component with zero state-shape change.
//
// Built on libphonenumber-js/min (smaller metadata bundle, same API surface
// as the full package) rather than hand-rolled per-country format tables —
// this app's forms need every country's national format (the user's
// explicit example is France), which is exactly what this library's
// metadata covers; reimplementing it would be both bigger and less correct.

const PRIORITY_COUNTRIES: CountryCode[] = ['SN', 'CI', 'ML', 'BF', 'TG', 'BJ', 'CM', 'FR'];
const DEFAULT_COUNTRY: CountryCode = 'SN';

function flagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: CountryCode): string {
  regionNames ??= new Intl.DisplayNames(['fr'], { type: 'region' });
  return regionNames.of(code) ?? code;
}

interface CountryOption {
  code: CountryCode;
  name: string;
  callingCode: string;
}

let allCountriesCache: CountryOption[] | null = null;
function allCountries(): CountryOption[] {
  if (allCountriesCache) return allCountriesCache;
  const options = getCountries().map((code) => ({
    code,
    name: countryName(code),
    callingCode: getCountryCallingCode(code),
  }));
  const byCode = new Map(options.map((o) => [o.code, o]));
  const priority = PRIORITY_COUNTRIES.map((c) => byCode.get(c)).filter(
    (o): o is CountryOption => !!o,
  );
  const prioritySet = new Set(PRIORITY_COUNTRIES);
  const rest = options
    .filter((o) => !prioritySet.has(o.code))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  allCountriesCache = [...priority, ...rest];
  return allCountriesCache;
}

// Normalizes a pasted "00"-prefixed international number (common outside
// the "+" convention) to "+..." so parsePhoneNumberFromString can detect
// the country the same way it would from a "+"-prefixed paste.
function normalizeForDetection(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return trimmed;
  const digitsOnly = trimmed.replace(/[\s().-]/g, '');
  if (/^00\d/.test(digitsOnly)) return `+${digitsOnly.slice(2)}`;
  return trimmed;
}

export interface PhoneFieldProps {
  label: string;
  name: string;
  /** E.164 string, e.g. "+221771234567" — or "" when empty. */
  value: string;
  onChange: (e164: string) => void;
  required?: boolean;
  disabled?: boolean;
  helper?: string;
  error?: string;
  placeholder?: string;
}

export default function PhoneField({
  label,
  name,
  value,
  onChange,
  required = false,
  disabled = false,
  helper,
  error,
  placeholder,
}: PhoneFieldProps) {
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [nationalInput, setNationalInput] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  // Tracks the last E.164 string *this component* emitted via onChange, so
  // the sync-from-parent effect below doesn't fight the user's own typing
  // when the parent simply echoes back what we just gave it.
  const lastEmitted = useRef('');
  // Outside-click-to-close — same self-contained pattern as
  // InvoiceRowMenu.tsx (no shared <Dropdown> primitive exists yet).
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [pickerOpen]);

  // Re-derive the displayed national format when `value` changes from
  // OUTSIDE this component (e.g. a prefilled value on mount).
  useEffect(() => {
    if (value === lastEmitted.current) return;
    if (!value) {
      setNationalInput('');
      return;
    }
    const parsed = parsePhoneNumberFromString(value);
    if (parsed) {
      setCountry(parsed.country ?? DEFAULT_COUNTRY);
      setNationalInput(parsed.formatNational());
    } else {
      setNationalInput(value);
    }
    lastEmitted.current = value;
    // Only re-sync when the externally-controlled value itself changes.
  }, [value]);

  function emitFromDigits(nextCountry: CountryCode, raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      lastEmitted.current = '';
      onChange('');
      return;
    }
    // parsePhoneNumberFromString yields the canonical E.164 once the number
    // is unambiguous; while the user is still mid-digit, fall back to a
    // naive "+<callingCode><digits>" concatenation so there's always
    // something submittable at every keystroke (server-side `zPhone` is the
    // actual source of truth on incomplete/invalid numbers, same
    // client-advisory/server-authoritative split every other field in this
    // app already follows).
    const parsed = parsePhoneNumberFromString(digits, nextCountry);
    const e164 = parsed ? parsed.number : `+${getCountryCallingCode(nextCountry)}${digits}`;
    lastEmitted.current = e164;
    onChange(e164);
  }

  function handleInputChange(raw: string) {
    const normalized = normalizeForDetection(raw);
    if (normalized.startsWith('+')) {
      const parsed = parsePhoneNumberFromString(normalized);
      if (parsed?.country) {
        setCountry(parsed.country);
        setNationalInput(parsed.formatNational());
        lastEmitted.current = parsed.number;
        onChange(parsed.number);
        return;
      }
    }
    const formatted = new AsYouType(country).input(raw);
    setNationalInput(formatted);
    emitFromDigits(country, raw);
  }

  function handleCountrySelect(code: CountryCode) {
    setCountry(code);
    setPickerOpen(false);
    setCountryQuery('');
    const digits = nationalInput.replace(/\D/g, '');
    const formatted = new AsYouType(code).input(digits);
    setNationalInput(formatted);
    emitFromDigits(code, digits);
  }

  const options = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    const list = allCountries();
    if (!q) return list.slice(0, 60);
    return list.filter(
      (o) => o.name.toLowerCase().includes(q) || o.callingCode.includes(q.replace('+', '')),
    );
  }, [countryQuery]);

  const selected = useMemo(() => allCountries().find((o) => o.code === country), [country]);
  const id = `phone-${name}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-accent ml-1">*</span>}
      </label>
      <div className="flex gap-2">
        <div ref={pickerRef} className="relative shrink-0">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPickerOpen((v) => !v)}
            aria-label="Choisir l'indicatif du pays"
            className={clsx(
              'flex h-full items-center gap-1.5 px-3 py-2 border rounded-md bg-input text-sm text-foreground',
              error ? 'border-warning' : 'border-border',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <span>{flagEmoji(country)}</span>
            <span className="text-muted-foreground">+{selected?.callingCode}</span>
            <Icon i="chevron-down" size={12} className="text-muted-foreground" />
          </button>
          {pickerOpen && (
            <div className="absolute z-20 mt-1 w-64 bg-surface border border-border rounded-md shadow-lg overflow-hidden">
              <div className="p-2 border-b border-border">
                <input
                  autoFocus
                  value={countryQuery}
                  onChange={(e) => setCountryQuery(e.target.value)}
                  placeholder="Rechercher un pays…"
                  className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-input outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="max-h-56 overflow-y-auto">
                {options.map((o) => (
                  <button
                    key={o.code}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleCountrySelect(o.code)}
                    className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-foreground hover:bg-input"
                  >
                    <span>{flagEmoji(o.code)}</span>
                    <span className="flex-1 truncate">{o.name}</span>
                    <span className="text-xs text-muted-foreground">+{o.callingCode}</span>
                  </button>
                ))}
                {options.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Aucun résultat.</div>
                )}
              </div>
            </div>
          )}
        </div>
        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          disabled={disabled}
          value={nationalInput}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={placeholder ?? 'Ex: 77 123 45 67'}
          className={clsx(
            'flex-1 min-w-0 border rounded-md px-3 py-2 text-sm text-foreground bg-input outline-none focus:ring-2 focus:ring-primary/30',
            error ? 'border-warning' : 'border-border',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        />
      </div>
      {error ? (
        <span className="text-xs text-warning">{error}</span>
      ) : helper ? (
        <span className="text-xs text-muted-foreground">{helper}</span>
      ) : null}
    </div>
  );
}
