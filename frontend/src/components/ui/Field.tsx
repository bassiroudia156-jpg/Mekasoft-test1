import { type ChangeEvent, type ReactNode, useId, useState } from 'react';
import clsx from 'clsx';
import DatePicker from './DatePicker';
import Icon from './Icon';

// Banani's FormField is a static mock — label + placeholder text, no real
// input. Real forms (client/vehicle/intervention creation, Phase 2+) need
// an actual controlled field, so this is a functional replacement that
// keeps the exact visual spec (border-border bg-input rounded-md px-3 py-2)
// while adding value/onChange/error — project rule (real forms need real
// inputs) overrides Banani's mock-only output. The password show/hide
// toggle (seen on every password field across login/signup/reset) is built
// in here rather than duplicated per screen.
type FieldType = 'text' | 'email' | 'tel' | 'password' | 'number' | 'date' | 'textarea' | 'select';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldProps {
  label: string;
  name: string;
  type?: FieldType;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  error?: string;
  required?: boolean;
  autoComplete?: string;
  options?: FieldOption[];
  rows?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  disabled?: boolean;
  /** Extra control rendered on the same row as the label, right-aligned
   * (e.g. an on/off Switch — see interventions' TVA toggle). */
  labelExtra?: ReactNode;
  /** Extra classes merged onto the input/textarea itself — e.g. reserved
   * right padding for a trailing icon overlaid by the caller (see
   * SearchSelect's dropdown chevron). */
  className?: string;
  /** `type: 'date'` only — ISO lower/upper bound (inclusive), e.g. clamping
   * "Au" to not precede "Du" on a date-range filter. `| undefined` so
   * callers can wire e.g. `dateFrom || undefined` straight through under
   * exactOptionalPropertyTypes. */
  min?: string | undefined;
  max?: string | undefined;
}

export default function Field({
  label,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  helper,
  error,
  required = false,
  autoComplete,
  options = [],
  rows = 3,
  onFocus,
  onBlur,
  disabled = false,
  labelExtra,
  className,
  min,
  max,
}: FieldProps) {
  const id = useId();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const inputClasses = clsx(
    'border rounded-md px-3 py-2 text-sm text-foreground bg-input outline-none focus:ring-2 focus:ring-primary/30',
    error ? 'border-warning' : 'border-border',
    disabled && 'opacity-50 cursor-not-allowed',
    className,
  );

  function handleChange(
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    onChange(e.target.value);
  }

  // Custom calendar popover instead of the OS-chrome native <input
  // type="date"> — see DatePicker.tsx. It owns its own label/required/
  // error/helper rendering (identical markup to the block below) since its
  // trigger is a <button>, not an <input>, so it can't share this
  // component's single input-shaped return.
  if (type === 'date') {
    return (
      <DatePicker
        label={label}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(helper !== undefined ? { helper } : {})}
        {...(error !== undefined ? { error } : {})}
        {...(labelExtra !== undefined ? { labelExtra } : {})}
        {...(className !== undefined ? { className } : {})}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}
            {required && <span className="text-accent ml-1">*</span>}
          </label>
          {labelExtra}
        </div>
      )}

      {type === 'textarea' ? (
        <textarea
          id={id}
          name={name}
          value={value}
          onChange={handleChange}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          required={required}
          rows={rows}
          disabled={disabled}
          className={inputClasses}
        />
      ) : type === 'select' ? (
        <div className="relative">
          <select
            id={id}
            name={name}
            value={value}
            onChange={handleChange}
            onFocus={onFocus}
            onBlur={onBlur}
            required={required}
            disabled={disabled}
            className={clsx(inputClasses, 'w-full appearance-none pr-8')}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Icon
            i="chevron-down"
            size={14}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      ) : type === 'password' ? (
        <div className="relative">
          <input
            id={id}
            name={name}
            type={passwordVisible ? 'text' : 'password'}
            value={value}
            onChange={handleChange}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={placeholder}
            required={required}
            autoComplete={autoComplete}
            disabled={disabled}
            className={clsx(inputClasses, 'w-full pr-9')}
          />
          <button
            type="button"
            onClick={() => setPasswordVisible((v) => !v)}
            aria-label={passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-muted-foreground"
          >
            <Icon i={passwordVisible ? 'eye' : 'eye-off'} size={14} />
          </button>
        </div>
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={handleChange}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          disabled={disabled}
          className={inputClasses}
        />
      )}

      {error ? (
        <span className="text-xs text-warning">{error}</span>
      ) : helper ? (
        <span className="text-xs text-muted-foreground">{helper}</span>
      ) : null}
    </div>
  );
}
