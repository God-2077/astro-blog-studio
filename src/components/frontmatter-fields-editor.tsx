import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import {
  FRONTMATTER_FIELD_TYPES,
  type FrontmatterField,
  type FrontmatterFieldType,
  KNOWN_BLOG_FIELDS,
} from '@/lib/frontmatter/fields';
import { useT } from '@/lib/i18n/react';

let fieldRowSequence = 0;

interface FrontmatterFieldsEditorProps {
  fields: FrontmatterField[];
  onChange: (fields: FrontmatterField[]) => void;
  onResetDefaults: () => void;
}

export function FrontmatterFieldsEditor({ fields, onChange, onResetDefaults }: FrontmatterFieldsEditorProps) {
  const t = useT();
  const rowKeysRef = useRef<string[]>([]);
  if (rowKeysRef.current.length !== fields.length) {
    const nextKeys: string[] = [];
    for (let index = 0; index < fields.length; index += 1) {
      const existing = rowKeysRef.current[index];
      if (existing) {
        nextKeys.push(existing);
      } else {
        fieldRowSequence += 1;
        nextKeys.push(`frontmatter-row-${fieldRowSequence}`);
      }
    }
    rowKeysRef.current = nextKeys;
  }
  const rowKeys = rowKeysRef.current;

  const update = (index: number, patch: Partial<FrontmatterField>): void => {
    onChange(fields.map((field, current) => (current === index ? { ...field, ...patch } : field)));
  };

  const remove = (index: number): void => {
    onChange(fields.filter((_, current) => current !== index));
  };

  const add = (): void => {
    onChange([...fields, { name: '', type: 'string', required: false }]);
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="hidden grid-cols-[minmax(0,1fr)_110px_76px_28px] gap-2 font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted sm:grid">
        <span>name</span>
        <span>type</span>
        <span>required</span>
        <span />
      </div>
      {fields.map((field, index) => (
        <div
          key={rowKeys[index] ?? field.name}
          className="grid items-center gap-1.5 rounded-lg border border-line-soft bg-paper px-2 py-1.5 sm:grid-cols-[minmax(0,1fr)_110px_76px_28px] sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
        >
          <input
            className="abs-input font-mono text-[11px]"
            value={field.name}
            onChange={(event) => update(index, { name: event.target.value })}
            placeholder="field_name"
            list="known-frontmatter-fields"
            aria-label={t('settings.fields.nameAria', { index: index + 1 })}
            spellCheck={false}
          />
          <select
            className="abs-select text-[11px]"
            value={field.type}
            onChange={(event) => update(index, { type: event.target.value as FrontmatterFieldType })}
            aria-label={t('settings.fields.typeAria', { name: field.name || index + 1 })}
          >
            {FRONTMATTER_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[10.5px] text-ink-soft">
            <input
              type="checkbox"
              className="size-3.5 accent-[var(--abs-sakura)]"
              checked={field.required}
              onChange={(event) => update(index, { required: event.target.checked })}
            />
            {t('settings.fields.required')}
          </label>
          <button
            type="button"
            className="abs-icon-btn size-7 justify-self-end text-danger"
            onClick={() => remove(index)}
            aria-label={t('settings.fields.removeAria', { name: field.name || index + 1 })}
            title={t('settings.fields.removeTitle')}
          >
            <Trash2 aria-hidden className="size-3.5" />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" className="abs-btn abs-btn-ghost h-7 text-[10.5px]" onClick={add} disabled={fields.length >= 40}>
          <Plus aria-hidden className="size-3" />
          {t('settings.fields.add')}
        </button>
        <button type="button" className="abs-btn abs-btn-ghost h-7 text-[10.5px]" onClick={onResetDefaults}>
          <RotateCcw aria-hidden className="size-3" />
          {t('settings.fields.reset')}
        </button>
        <span className="ml-auto font-mono text-[9px] text-muted">{t('settings.fields.limit', { count: fields.length })}</span>
      </div>

      <datalist id="known-frontmatter-fields">
        {Object.keys(KNOWN_BLOG_FIELDS).map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <p className="text-[9.5px] leading-relaxed text-muted">{t('settings.fields.hint')}</p>
    </div>
  );
}
