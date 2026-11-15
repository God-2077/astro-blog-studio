import { Check } from 'lucide-react';
import { useT } from '@/lib/i18n/react';
import { REPO_KINDS, type RepoKind, repoKindDescriptionKey, repoKindLabelKey } from '@/lib/repos/kinds';
import { cn } from '@/lib/utils/cn';

/**
 * Radio cards for the repository layout preset. Used by both the add-repository
 * dialog and the first-run setup page so a Daybook repository can be the first
 * workspace too.
 */
export function RepoKindPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: RepoKind;
  onChange: (kind: RepoKind) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2" aria-label={t('common.repoKind.label')} disabled={disabled}>
      <legend className="sr-only">{t('common.repoKind.label')}</legend>
      {REPO_KINDS.map((kind) => {
        const active = kind === value;
        return (
          <label
            key={kind}
            className={cn(
              'relative flex cursor-pointer flex-col gap-1 rounded-xl border-[1.5px] px-3 py-2.5 transition',
              active ? 'border-sakura bg-blush-2' : 'border-line bg-paper-2 hover:border-sakura/40',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name="repo-kind"
              className="sr-only"
              value={kind}
              checked={active}
              disabled={disabled}
              onChange={() => onChange(kind)}
            />
            <span className="flex items-center gap-1.5 font-display text-[12.5px] font-bold">
              {t(repoKindLabelKey(kind))}
              {active ? <Check aria-hidden className="size-3.5 text-sakura" /> : null}
            </span>
            <span className="text-[10px] leading-relaxed text-muted">{t(repoKindDescriptionKey(kind))}</span>
            <code className="mt-0.5 font-mono text-[9px] text-ink-soft">
              {kind === 'daybook' ? 'daily · post · pages · spec' : 'src/content'}
            </code>
          </label>
        );
      })}
    </fieldset>
  );
}
