import { ChevronDown, GripVertical, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui';
import {
  FRONTMATTER_FIELD_TYPES,
  type FrontmatterField,
  type FrontmatterFieldType,
  isEnumFieldType,
  isFullWidthField,
  KNOWN_BLOG_FIELDS,
  moveFrontmatterField,
  normalizeFieldOptions,
} from '@/lib/frontmatter/fields';
import { useT } from '@/lib/i18n/react';
import { cn } from '@/lib/utils/cn';

let fieldRowSequence = 0;

function optionsFromText(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Keep the raw textarea text so trailing spaces/newlines remain editable; the stored options are normalized. */
function EnumOptionsInput({ initialValue, onChange }: { initialValue: string; onChange: (options: string[]) => void }) {
  const t = useT();
  const [text, setText] = useState(initialValue);

  return (
    <label className="abs-field sm:col-span-2">
      <span>{t('settings.fields.options')}</span>
      <textarea
        className="abs-textarea text-[11px]"
        rows={3}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          onChange(optionsFromText(next));
        }}
        onBlur={() => {
          const options = optionsFromText(text);
          setText(options.join('\n'));
          onChange(options);
        }}
        placeholder={t('settings.fields.optionsPlaceholder')}
      />
      <small className="text-[10px] leading-relaxed text-muted">{t('settings.fields.optionsHint')}</small>
    </label>
  );
}

interface FrontmatterFieldsEditorProps {
  fields: FrontmatterField[];
  onChange: (fields: FrontmatterField[]) => void;
  onResetDefaults: () => void;
}

export function FrontmatterFieldsEditor({ fields, onChange, onResetDefaults }: FrontmatterFieldsEditorProps) {
  const t = useT();
  const rowKeysRef = useRef<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  if (rowKeysRef.current.length !== fields.length) {
    const nextKeys = rowKeysRef.current.slice(0, fields.length);
    while (nextKeys.length < fields.length) {
      fieldRowSequence += 1;
      nextKeys.push(`frontmatter-row-${fieldRowSequence}`);
    }
    rowKeysRef.current = nextKeys;
  }
  const rowKeys = rowKeysRef.current;

  const update = (index: number, patch: Partial<FrontmatterField>): void => {
    onChange(fields.map((field, current) => (current === index ? { ...field, ...patch } : field)));
  };

  const remove = (index: number): void => {
    const rowKey = rowKeys[index];
    rowKeysRef.current = rowKeys.filter((_, current) => current !== index);
    if (rowKey) {
      setExpandedKeys((previous) => {
        const next = new Set(previous);
        next.delete(rowKey);
        return next;
      });
    }
    onChange(fields.filter((_, current) => current !== index));
  };

  const add = (): void => {
    fieldRowSequence += 1;
    const rowKey = `frontmatter-row-${fieldRowSequence}`;
    rowKeysRef.current = [...rowKeys, rowKey];
    setExpandedKeys((previous) => new Set(previous).add(rowKey));
    onChange([...fields, { name: '', type: 'string', required: false }]);
  };

  const reorder = (from: number, to: number): void => {
    if (from === to) return;
    rowKeysRef.current = moveFrontmatterField(
      rowKeys.map((key) => ({ name: key, type: 'string', required: false })),
      from,
      to,
    ).map((field) => field.name);
    onChange(moveFrontmatterField(fields, from, to));
  };

  const toggleExpanded = (key: string): void => {
    setExpandedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetDefaults = (): void => {
    rowKeysRef.current = [];
    setExpandedKeys(new Set());
    onResetDefaults();
  };

  return (
    <div className="mt-2 space-y-2">
      {fields.map((field, index) => {
        const rowKey = rowKeys[index] ?? field.name;
        const expanded = expandedKeys.has(rowKey);
        const panelId = `frontmatter-panel-${rowKey}`;
        const defaultControlId = `frontmatter-default-${rowKey}`;
        const options = normalizeFieldOptions(field.options);
        const defaultSelections =
          field.type === 'enum-list'
            ? (field.defaultValue ?? '')
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
            : field.type === 'enum' && field.defaultValue
              ? [field.defaultValue]
              : [];
        const defaultChoices = [...new Set([...options, ...defaultSelections])];
        return (
          <fieldset
            key={rowKey}
            data-field-row
            aria-label={field.name || t('settings.fields.unnamed')}
            className={cn(
              'min-w-0 rounded-lg border border-line-soft bg-paper transition-colors',
              dragIndex !== null && overIndex === index && dragIndex !== index && 'border-sakura bg-blush-2/40',
              dragIndex === index && 'opacity-60',
            )}
            onDragOver={(event) => {
              if (dragIndex === null) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setOverIndex(index);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragIndex !== null) reorder(dragIndex, index);
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
          >
            <div className="flex items-center gap-1 px-2 py-1.5">
              <button
                type="button"
                draggable
                className="abs-icon-btn size-6 shrink-0 cursor-grab active:cursor-grabbing"
                aria-label={t('settings.fields.dragAria', { name: field.name || index + 1 })}
                title={t('settings.fields.dragTitle')}
                onDragStart={(event) => {
                  setDragIndex(index);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(index));
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp' && index > 0) {
                    event.preventDefault();
                    reorder(index, index - 1);
                  } else if (event.key === 'ArrowDown' && index < fields.length - 1) {
                    event.preventDefault();
                    reorder(index, index + 1);
                  }
                }}
              >
                <GripVertical aria-hidden className="size-3.5" />
              </button>

              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggleExpanded(rowKey)}
              >
                <span className={cn('truncate font-mono text-[11px]', field.name ? 'text-ink' : 'text-muted italic')}>
                  {field.name || t('settings.fields.unnamed')}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  <Badge tone="ghost">{field.type}</Badge>
                  {field.required ? <Badge tone="blush">{t('settings.fields.required')}</Badge> : null}
                  <ChevronDown
                    aria-hidden
                    className={cn('size-3.5 shrink-0 text-muted transition-transform', !expanded && '-rotate-90')}
                  />
                </span>
              </button>

              <button
                type="button"
                className="abs-icon-btn size-7 shrink-0 text-danger"
                onClick={() => remove(index)}
                aria-label={t('settings.fields.removeAria', { name: field.name || index + 1 })}
                title={t('settings.fields.removeTitle')}
              >
                <Trash2 aria-hidden className="size-3.5" />
              </button>
            </div>

            <div id={panelId} className="grid gap-2 border-t border-line-soft px-2 py-2 sm:grid-cols-2" hidden={!expanded}>
              <label className="abs-field">
                <span>{t('settings.fields.name')}</span>
                <input
                  className="abs-input font-mono text-[11px]"
                  value={field.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                  placeholder="field_name"
                  list="known-frontmatter-fields"
                  aria-label={t('settings.fields.nameAria', { index: index + 1 })}
                  spellCheck={false}
                />
              </label>
              <label className="abs-field">
                <span>{t('settings.fields.type')}</span>
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
              </label>

              <label className="abs-field sm:col-span-2">
                <span>{t('settings.fields.description')}</span>
                <textarea
                  className="abs-textarea text-[11px]"
                  rows={2}
                  value={field.description ?? ''}
                  onChange={(event) => update(index, { description: event.target.value })}
                  placeholder={t('settings.fields.descriptionPlaceholder')}
                  maxLength={500}
                />
              </label>

              {isEnumFieldType(field.type) ? (
                <EnumOptionsInput
                  key={`options-${rowKey}`}
                  initialValue={(field.options ?? []).join('\n')}
                  onChange={(options) => update(index, { options })}
                />
              ) : null}

              <label className="abs-field sm:col-span-2" htmlFor={defaultControlId}>
                <span>{t('settings.fields.defaultValue')}</span>
                {field.type === 'boolean' ? (
                  <select
                    id={defaultControlId}
                    className="abs-select text-[11px]"
                    value={
                      field.defaultValue === undefined
                        ? field.name === 'draft'
                          ? 'true'
                          : 'none'
                        : field.defaultValue === ''
                          ? 'none'
                          : field.defaultValue
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      update(index, { defaultValue: value === 'none' ? '' : value });
                    }}
                  >
                    <option value="none">{t('settings.fields.defaultNone')}</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : field.type === 'enum' ? (
                  <select
                    id={defaultControlId}
                    className="abs-select text-[11px]"
                    value={field.defaultValue ?? ''}
                    onChange={(event) => update(index, { defaultValue: event.target.value })}
                  >
                    <option value="">{t('settings.fields.defaultNone')}</option>
                    {defaultChoices.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'enum-list' ? (
                  <select
                    id={defaultControlId}
                    className="abs-select min-h-[76px] text-[11px]"
                    multiple
                    value={defaultSelections}
                    onChange={(event) =>
                      update(index, {
                        defaultValue: Array.from(event.target.selectedOptions, (option) => option.value).join(', '),
                      })
                    }
                  >
                    {defaultChoices.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'text' ? (
                  <textarea
                    id={defaultControlId}
                    className="abs-textarea text-[11px]"
                    rows={2}
                    value={field.defaultValue ?? ''}
                    onChange={(event) => update(index, { defaultValue: event.target.value })}
                    placeholder={t('settings.fields.defaultPlaceholder')}
                  />
                ) : (
                  <input
                    id={defaultControlId}
                    className="abs-input text-[11px]"
                    type={field.type === 'number' ? 'number' : 'text'}
                    step={field.type === 'number' ? 'any' : undefined}
                    value={field.defaultValue ?? ''}
                    onChange={(event) => update(index, { defaultValue: event.target.value })}
                    placeholder={
                      field.type === 'date'
                        ? 'YYYY-MM-DD'
                        : field.type === 'datetime'
                          ? 'YYYY-MM-DD HH:mm:ss'
                          : t('settings.fields.defaultPlaceholder')
                    }
                    spellCheck={false}
                  />
                )}
              </label>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2">
                <label className="flex items-center gap-1.5 text-[10.5px] text-ink-soft">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-[var(--abs-sakura)]"
                    checked={field.required}
                    onChange={(event) => update(index, { required: event.target.checked })}
                  />
                  {t('settings.fields.required')}
                </label>
                <label className="flex items-center gap-1.5 text-[10.5px] text-ink-soft">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-[var(--abs-sakura)]"
                    checked={isFullWidthField(field)}
                    onChange={(event) => update(index, { fullWidth: event.target.checked })}
                  />
                  {t('settings.fields.fullWidth')}
                </label>
              </div>
            </div>
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" className="abs-btn abs-btn-ghost h-7 text-[10.5px]" onClick={add} disabled={fields.length >= 40}>
          <Plus aria-hidden className="size-3" />
          {t('settings.fields.add')}
        </button>
        <button type="button" className="abs-btn abs-btn-ghost h-7 text-[10.5px]" onClick={resetDefaults}>
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
