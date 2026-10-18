import { Field } from '@/components/ui';
import type { FrontmatterField, FrontmatterFormValue, FrontmatterFormValues } from '@/lib/frontmatter/fields';
import { cn } from '@/lib/utils/cn';

interface FrontmatterFormProps {
  fields: readonly FrontmatterField[];
  values: FrontmatterFormValues;
  errors: Record<string, string>;
  onChange: (name: string, value: FrontmatterFormValue) => void;
}

export function FrontmatterForm({ fields, values, errors, onChange }: FrontmatterFormProps) {
  if (fields.length === 0) {
    return (
      <p className="mt-2 rounded-lg border border-dashed border-line bg-paper-2 px-3 py-2 text-[10.5px] leading-relaxed text-muted">
        当前没有配置 frontmatter 字段。可以在设置里添加字段；已有文件里的字段会作为未知字段原样保留。
      </p>
    );
  }

  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {fields.map((field) => {
        const value = values[field.name] ?? (field.type === 'boolean' ? false : '');
        const error = errors[field.name];
        const label = `${field.name}${field.required ? ' *' : ''}`;
        const fullWidth = field.name === 'title' || field.name === 'description';

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
              {error ? (
                <small className="text-[10px] text-danger" role="alert">
                  {error}
                </small>
              ) : null}
            </div>
          );
        }

        const hint =
          field.type === 'date'
            ? undefined
            : field.type === 'list'
              ? field.name === 'categories'
                ? '逗号分隔；用 > 表示层级'
                : '逗号分隔'
              : undefined;

        return (
          <Field key={field.name} label={label} hint={hint} className={cn(fullWidth && 'sm:col-span-2')}>
            {field.type === 'date' ? (
              <input
                className="abs-input font-mono text-[11px]"
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => onChange(field.name, event.target.value)}
                placeholder="YYYY-MM-DD HH:mm:ss"
                spellCheck={false}
              />
            ) : field.type === 'number' ? (
              <input
                className="abs-input"
                type="number"
                step="any"
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => onChange(field.name, event.target.value)}
              />
            ) : field.type === 'list' ? (
              <input
                className="abs-input font-mono text-[11px]"
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => onChange(field.name, event.target.value)}
                placeholder={field.name === 'categories' ? '笔记 > 备忘, 文章' : 'a, b, c'}
                spellCheck={false}
              />
            ) : (
              <input
                className="abs-input"
                type={field.name === 'password' ? 'password' : 'text'}
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => onChange(field.name, event.target.value)}
                autoComplete="off"
                spellCheck={field.name !== 'password'}
              />
            )}
            {error ? (
              <small className="text-[10px] text-danger" role="alert">
                {error}
              </small>
            ) : null}
          </Field>
        );
      })}
    </div>
  );
}
