import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { FilePlus2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Field } from '@/components/ui';
import { useGateway } from '@/lib/gateway/context';
import { mapError } from '@/lib/github/errors';
import { renderCommitMessage } from '@/lib/paths/commit-message';
import { joinPath, normalizeRepoPath, withoutExtension } from '@/lib/paths/paths';
import { collectFolders, type TreeModel } from '@/lib/tree/model';
import { formatInTimeZone } from '@/lib/utils/date';
import { useLastCommit } from '@/stores/last-commit';
import { useSettings } from '@/stores/settings';

function sanitizeFilePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');
}

export function NewPostDialog({
  open,
  onOpenChange,
  model,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: TreeModel | null;
}) {
  const { gateway, repo, config, key } = useGateway();
  const settings = useSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setLastCommit = useLastCommit((state) => state.setCommit);
  const [title, setTitle] = useState('');
  const [dir, setDir] = useState(settings.editor.defaultDir || config.rootDir);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const folders = useMemo(
    () => (model ? collectFolders(model.nodes).map((folder) => joinPath(config.rootDir, folder.path)) : []),
    [model, config.rootDir],
  );

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setFilename('');
    setError(null);
    setBusy(false);
    const preferred = settings.editor.defaultDir || config.rootDir;
    setDir(folders.includes(preferred) ? preferred : config.rootDir);
  }, [open, settings.editor.defaultDir, config.rootDir, folders]);

  const safeName = sanitizeFilePart(filename || title);
  const finalFile = safeName ? (safeName.toLowerCase().endsWith('.md') ? safeName : `${safeName}.md`) : '';
  const normalizedDir = normalizeRepoPath(dir);
  const fullDir =
    config.rootDir && normalizedDir && !normalizedDir.startsWith(config.rootDir)
      ? joinPath(config.rootDir, normalizedDir)
      : normalizedDir || config.rootDir;
  const path = joinPath(fullDir, finalFile);
  const date = formatInTimeZone(new Date(), settings.content.timezone);
  const template = settings.editor.frontmatterTemplate
    .replaceAll('{title}', title.replaceAll("'", "''"))
    .replaceAll('{date}', date)
    .replaceAll('{dir}', fullDir)
    .replaceAll('{name}', withoutExtension(finalFile));

  const collision = Boolean(model?.files.some((file) => file.path === path));

  const handleCreate = async (): Promise<void> => {
    if (!title.trim()) {
      setError('标题不能为空');
      return;
    }
    if (!finalFile) {
      setError('文件名不能为空');
      return;
    }
    if (collision) {
      setError('这个路径已经有文件了');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const message = renderCommitMessage(settings.commit.create, { path, action: 'create', date });
      const text = `${template.endsWith('\n') ? template : `${template}\n`}\n`;
      const result = await gateway.writeFile({ path, text, message, branch: repo.defaultBranch });
      setLastCommit({ sha: result.sha, message: result.message, path, at: Date.now(), htmlUrl: result.htmlUrl });
      await queryClient.invalidateQueries({ queryKey: ['tree', key] });
      toast.success('已创建并提交');
      onOpenChange(false);
      navigate(`/edit?path=${encodeURIComponent(path)}`);
    } catch (caught) {
      setError(mapError(caught).detail ?? mapError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px] data-[state=open]:animate-[abs-pop_160ms_ease-out]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(600px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[1.5px] border-ink bg-paper p-5 shadow-pop outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-sakura">new draft</p>
              <Dialog.Title className="font-display text-[22px] font-bold leading-tight">新建文章</Dialog.Title>
              <Dialog.Description className="mt-1 text-[11px] text-muted">
                会直接创建一个提交到 {repo.defaultBranch}；提交消息使用设置里的模板。
              </Dialog.Description>
            </div>
            <Dialog.Close className="abs-icon-btn" aria-label="关闭">
              <X aria-hidden className="size-3.5" />
            </Dialog.Close>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="标题" className="sm:col-span-2">
              <input
                className="abs-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：便笺：今天的语法备忘"
              />
            </Field>
            <Field label="目录" hint={<span className="font-mono">在博客根目录内选择或输入</span>}>
              <input
                className="abs-input font-mono text-[11px]"
                value={dir}
                onChange={(event) => setDir(event.target.value)}
                list="studio-folders"
              />
              <datalist id="studio-folders">
                {folders.map((folder) => (
                  <option key={folder} value={folder} />
                ))}
              </datalist>
            </Field>
            <Field label="文件名" hint={<span className="font-mono">留空时用标题</span>}>
              <input
                className="abs-input font-mono text-[11px]"
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
                placeholder={safeName ? `${safeName}.md` : 'filename.md'}
              />
            </Field>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-line bg-paper-2 px-3 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">将创建</p>
            <p className="mt-1 break-all font-mono text-[11px] text-ink">{path || '…'}</p>
            <p className="mt-2 text-[10px] text-muted">
              提交消息：
              <code className="font-mono text-[10px] text-sakura">
                {renderCommitMessage(settings.commit.create, { path, action: 'create', date })}
              </code>
            </p>
          </div>

          {error ? (
            <p className="mt-3 rounded-lg border border-danger/30 bg-white/70 px-3 py-2 text-[11px] text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex items-center justify-end gap-2">
            <Dialog.Close className="abs-btn abs-btn-ghost h-8 text-[11px]">取消</Dialog.Close>
            <button
              type="button"
              className="abs-btn abs-btn-primary h-8 text-[11px]"
              onClick={() => void handleCreate()}
              disabled={busy}
            >
              <FilePlus2 aria-hidden className="size-3.5" />
              {busy ? '创建中…' : '创建并打开'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
