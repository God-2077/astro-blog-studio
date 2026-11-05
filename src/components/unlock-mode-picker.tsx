import { useId } from 'react';
import { useT } from '@/lib/i18n/react';
import { cn } from '@/lib/utils/cn';
import { VAULT_MODE_OPTIONS, type VaultMode } from '@/lib/vault/mode';

interface UnlockModePickerProps {
  value: VaultMode;
  onChange: (mode: VaultMode) => void;
  disabled?: boolean;
  /** Hide the group label when the surrounding form already explains it. */
  hideLegend?: boolean;
}

/**
 * One explicit choice instead of two checkboxes. `two-factor` is a single mode
 * whose key needs the password AND this device; it never creates a device-only
 * wrap, so the UI must not offer a device-only escape hatch either.
 */
export function UnlockModePicker({ value, onChange, disabled, hideLegend }: UnlockModePickerProps) {
  const name = useId();
  const t = useT();

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className={cn('abs-label', hideLegend && 'sr-only')}>{t('unlock.modePicker.legend')}</legend>
      <div className="mt-1.5 grid gap-2">
        {VAULT_MODE_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-lg border bg-paper px-3 py-2 text-[11px] transition',
                selected ? 'border-sakura/60' : 'border-line hover:border-sakura/40',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                className="mt-0.5 size-3.5 accent-[var(--abs-sakura)]"
                aria-label={t(option.labelKey)}
                checked={selected}
                onChange={() => onChange(option.value)}
                disabled={disabled}
              />
              <span className="min-w-0">
                <strong className="block">{t(option.labelKey)}</strong>
                <span className="text-muted">{t(option.hintKey)}</span>
              </span>
            </label>
          );
        })}
      </div>

      {value === 'two-factor' ? (
        <p
          className="mt-2 rounded-lg border border-danger/30 bg-[var(--abs-danger-surface)] px-3 py-2 text-[10.5px] leading-relaxed text-danger"
          role="note"
        >
          {t('unlock.modePicker.twoFactorWarning')}
        </p>
      ) : null}
    </fieldset>
  );
}
