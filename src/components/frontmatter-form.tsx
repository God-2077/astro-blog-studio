import { CalendarClock } from 'lucide-react';
import { Field } from '@/components/ui';
import {
  type FrontmatterField,
  type FrontmatterFormValue,
  type FrontmatterFormValues,
  isDateFieldType,
  isEnumFieldType,
  isFullWidthField,
  knownFieldHint,
  normalizeFieldOptions,
} from '@/lib/frontmatter/fields';
import { useT } from '@/lib/i18n/react';
import { cn } from '@/lib/utils/cn';
import { dateOnlyInTimeZone, formatInTimeZone } from '@/lib/utils/date';

interface FrontmatterFormProps {
  fields: readonly FrontmatterField[];
  values: FrontmatterFormValues;
  errors: Record<string, string>;
  timezone: string;
  onChange: (name: string, value: FrontmatterFormValue) => void;
}

function splitSelected(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function fieldHint(field: FrontmatterField, t: ReturnType<typeof useT>): string | undefined {
  const description = field.description?.trim();
  const parts: string[] = [];
  if (description) parts.push(description);
  if (field.type === 'list') {
    const categoryHint = field.name === 'categories' ? knownFieldHint('categories') : undefined;
    parts.push(categoryHint ? `${t('editor.form.listHint')}；${categoryHint}` : t('editor.form.listHint'));
  }
  if (field.type === 'enum-list') parts.push(t('editor.form.multiSelectHint'));
  if (!description && field.name !== 'categories') {
    const hint = knownFieldHint(field.name);
    if (hint) parts.push(hint);
  }
  return parts.length ? parts.join('；') : undefined;
}

export function FrontmatterForm({ fields, values, errors, timezone, onChange }: FrontmatterFormProps) {
  const t = useT();
  if (fields.length === 0) {
    return (
      <p className="mt-2 rounded-lg border border-dashed border-line bg-paper-2 px-3 py-2 text-[10.5px] leading-relaxed text-muted">
        {t('editor.form.empty')}
      </p>
    );
  }

  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {fields.map((field) => {
        const value = values[field.name] ?? (field.type === 'boolean' ? false : '');
        const text = typeof value === 'string' ? value : '';
        const error = errors[field.name];
        const label = `${field.name}${field.required ? ' *' : ''}`;
        const fullWidth = isFullWidthField(field);
        const hint = fieldHint(field, t);
        const errorNode = error ? (
          <small className="text-[10px] text-danger" role="alert">
            {error}
          </small>
        ) : null;

        if (field.type === 'boolean') {
          return (
            <div key={field.name} className="abs-field">
              <span>{label}</span>
              <label className="flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--abs-sakura)]"
                  checked={value === true}
                  onChange={(event) => onChange(field.name, event.target.checked)}
                  aria-label={field.name}
                />
                <span className="font-mono text-[10px] text-muted">{value === true ? 'true' : 'false'}</span>
              </label>
              {hint ? <small className="text-[10px] leading-relaxed text-muted">{hint}</small> : null}
              {errorNode}
            </div>
          );
        }

        if (isDateFieldType(field.type)) {
          const fillNow = (): void => {
            const now = new Date();
            onChange(field.name, field.type === 'date' ? dateOnlyInTimeZone(now, timezone) : formatInTimeZone(now, timezone));
          };
          return (
            <div key={field.name} className={cn('abs-field', fullWidth && 'sm:col-span-2')}>
              <span>{label}</span>
              <div className="flex items-center gap-1.5">
                <input
                  className="abs-input min-w-0 flex-1 font-mono text-[11px]"
                  value={text}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  placeholder={field.type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss'}
                  aria-label={field.name}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="abs-icon-btn size-8 shrink-0"
                  onClick={fillNow}
                  aria-label={t('editor.form.fillNow')}
                  title={t('editor.form.fillNow')}
                >
                  <CalendarClock aria-hidden className="size-3.5" />
                </button>
              </div>
              {hint ? <small className="text-[10px] leading-relaxed text-muted">{hint}</small> : null}
              {errorNode}
            </div>
          );
        }

        const options = isEnumFieldType(field.type) ? normalizeFieldOptions(field.options) : [];

        if (field.type === 'enum-list' && options.length > 0) {
          const selected = splitSelected(text);
          const unknown = selected.filter((item) => !options.includes(item));
          const choices = [...new Set([...options, ...unknown])];
          const toggle = (option: string): void => {
            const next = selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option];
            onChange(field.name, next.join(', '));
          };
          return (
            <fieldset key={field.name} className={cn('abs-field m-0 min-w-0 border-0 p-0', fullWidth && 'sm:col-span-2')}>
              <legend className="abs-label p-0">{label}</legend>
              <div className="flex flex-wrap gap-1.5">
                {choices.map((option) => (
                  <label
                    key={option}
                    className={cn(
                      'flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 text-[10.5px] transition-colors',
                      selected.includes(option)
                        ? 'border-sakura bg-blush-2/50 text-ink'
                        : 'border-line-soft bg-paper text-ink-soft',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-3 accent-[var(--abs-sakura)]"
                      checked={selected.includes(option)}
                      onChange={() => toggle(option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
              {hint ? <small className="text-[10px] leading-relaxed text-muted">{hint}</small> : null}
              {errorNode}
            </fieldset>
          );
        }

        if (field.type === 'enum' && options.length > 0) {
          return (
            <Field key={field.name} label={label} hint={hint} className={cn(fullWidth && 'sm:col-span-2')}>
              <select
                className="abs-select text-[11px]"
                value={text}
                onChange={(event) => onChange(field.name, event.target.value)}
                aria-label={field.name}
              >
                <option value="">{t('editor.form.selectPlaceholder')}</option>
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                {text && !options.includes(text) ? <option value={text}>{text}</option> : null}
              </select>
              {errorNode}
            </Field>
          );
        }

        return (
          <Field key={field.name} label={label} hint={hint} className={cn(fullWidth && 'sm:col-span-2')}>
            {isEnumFieldType(field.type) ? (
              <input
                className="abs-input font-mono text-[11px]"
                value={text}
                onChange={(event) => onChange(field.name, event.target.value)}
                placeholder={field.type === 'enum-list' ? t('editor.form.listPlaceholder') : undefined}
                spellCheck={false}
              />
            ) : field.type === 'number' ? (
              <input
                className="abs-input"
                type="number"
                step="any"
                value={text}
                onChange={(event) => onChange(field.name, event.target.value)}
              />
            ) : field.type === 'list' ? (
              <input
                className="abs-input font-mono text-[11px]"
                value={text}
                onChange={(event) => onChange(field.name, event.target.value)}
                placeholder={
                  field.name === 'categories' ? t('editor.form.categoriesPlaceholder') : t('editor.form.listPlaceholder')
                }
                spellCheck={false}
              />
            ) : field.type === 'text' ? (
              <textarea
                className="abs-textarea min-h-[64px] text-[12px]"
                rows={2}
                value={text}
                onChange={(event) => onChange(field.name, event.target.value)}
              />
            ) : (
              <input
                className="abs-input"
                type={field.name === 'password' ? 'password' : 'text'}
                value={text}
                onChange={(event) => onChange(field.name, event.target.value)}
                autoComplete="off"
                spellCheck={field.name !== 'password'}
              />
            )}
            {errorNode}
          </Field>
        );
      })}
    </div>
  );
}
