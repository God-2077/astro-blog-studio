import * as AlarmDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import { useQueryClient } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { ArrowLeft, ArrowUpRight, Check, FileWarning, MoveRight, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BackupDialog } from '@/components/backup-dialog';
import { confirmAction } from '@/components/confirm-toast';
import { FrontmatterForm } from '@/components/frontmatter-form';
import { useResolvedTheme } from '@/components/theme-provider';
import { Badge, ErrorNote, Field, Spinner } from '@/components/ui';
import { useFile } from '@/hooks/use-data';
import { type BackupSnapshot, useEditorBackup } from '@/hooks/use-editor-backup';
import {
  type BackupRecord,
  backupCharCount,
  backupRemoteChanged,
  backupRepoKey,
  buildBackupText,
  restoreToEditorState,
} from '@/lib/backup/model';
import { readBackup } from '@/lib/backup/store';
import { type DraftRecord, draftFromBackup, draftToBackup } from '@/lib/drafts/model';
import { readDraft, removeDraft, writeDraft } from '@/lib/drafts/store';
import {
  buildFrontmatterPatch,
  type FrontmatterFormValue,
  type FrontmatterFormValues,
  formValuesFromData,
  missingRequiredFieldNames,
} from '@/lib/frontmatter/fields';
import { useGateway } from '@/lib/gateway/context';
import { mapError } from '@/lib/github/errors';
import { useActiveLocale, useT } from '@/lib/i18n/react';
import {
  composeDocument,
  composeSourceDocument,
  type DocumentMeta,
  parseDocument,
  toEditingText,
  updateFrontmatterRaw,
} from '@/lib/markdown/document';
import { createEditorTheme, markdownEditorExtensions } from '@/lib/markdown/editor-theme';
import { renderMarkdown } from '@/lib/markdown/render';
import { renderCommitMessage, resolveCommitTitle } from '@/lib/paths/commit-message';
import { joinPath, normalizeRepoPath } from '@/lib/paths/paths';
import { formatInTimeZone } from '@/lib/utils/date';
import { useDrafts } from '@/stores/drafts';
import { useEditorGuard } from '@/stores/editor';
import { useLastCommit } from '@/stores/last-commit';
import { usePendingPost } from '@/stores/pending-post';
import { useSettings } from '@/stores/settings';

type EditorMode = 'form' | 'source';

/**
 * The route entry is keyed by file (and draft state): switching files unmounts
 * the previous session so its unsaved snapshot can be flushed before the new
 * state replaces it, and each entry checks local backups exactly once.
 */
export function EditorPage() {
  const [params] = useSearchParams();
  const path = params.get('path');
  const isNew = params.get('new') === '1';
  const draftRequested = params.get('draft') === '1';
  return (
    <EditorSession
      key={`${path ?? ''}|${isNew ? 'new' : 'edit'}|${draftRequested ? 'draft' : 'live'}`}
      path={path}
      isNew={isNew}
      draftRequested={draftRequested}
    />
  );
}

function EditorSession({ path, isNew, draftRequested }: { path: string | null; isNew: boolean; draftRequested: boolean }) {
  const navigate = useNavigate();
  const { gateway, repo, config, key, mode } = useGateway();
  const settings = useSettings();
  const t = useT();
  const locale = useActiveLocale();
  const resolvedTheme = useResolvedTheme();
  const fields = settings.frontmatter.fields;
  const queryClient = useQueryClient();
  const setLastCommit = useLastCommit((state) => state.setCommit);
  const pendingDraft = usePendingPost((state) => state.draft);
  const file = useFile(isNew ? null : path);

  const [body, setBody] = useState('');
  const [rawInner, setRawInner] = useState('');
  const [hasFrontmatter, setHasFrontmatter] = useState(true);
  const [meta, setMeta] = useState<DocumentMeta>({ eol: '\n', mixed: false, bom: false, trailingNewline: true });
  const [form, setForm] = useState<FrontmatterFormValues>({});
  const [originalData, setOriginalData] = useState<Record<string, unknown>>({});
  const [loadedSha, setLoadedSha] = useState('');
  const [fmError, setFmError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [draftLost, setDraftLost] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stamping, setStamping] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messageEdited, setMessageEdited] = useState(false);
  const messageSourceRef = useRef('');
  const [conflictOpen, setConflictOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('form');
  const [sourceText, setSourceText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [pristine, setPristine] = useState(false);
  const [draftReady, setDraftReady] = useState(!draftRequested);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  /** Set when a restored new-post backup was in source mode; consumed by the load effect. */
  const pendingNewRestoreRef = useRef<{ path: string; sourceText: string } | null>(null);
  /** The draft box record chosen in the dashboard; consumed once by the load effect. */
  const openedDraftRef = useRef<DraftRecord | null>(null);
  /** This session's content came from the draft box, so committing retires it. */
  const draftLoadedRef = useRef(false);

  useEffect(() => {
    if (!path) return;
    if (!draftReady) return;
    const source = isNew ? pendingDraft : file.data ? { path: file.data.path, text: file.data.text } : null;
    if (isNew && (!source || source.path !== path)) {
      setDraftLost(true);
      return;
    }
    if (!source) return;

    const parsed = parseDocument(source.text);
    setDraftLost(false);
    setRawInner(parsed.frontmatterRaw);
    setHasFrontmatter(parsed.hasFrontmatter);
    setMeta(parsed.meta);
    setBody(parsed.body.replace(/\r\n?/g, '\n'));
    setForm(formValuesFromData(fields, parsed.data));
    setOriginalData(parsed.data);
    setFmError(parsed.frontmatterError ?? null);
    setFieldErrors({});
    setLoadedSha(isNew ? '' : (file.data?.sha ?? ''));
    setDirty(isNew);
    setConflictOpen(false);
    setSaveOpen(false);
    setOriginalText(source.text);
    setSourceText(toEditingText(source.text));
    const pendingNewRestore = pendingNewRestoreRef.current;
    if (isNew && pendingNewRestore?.path === path) {
      pendingNewRestoreRef.current = null;
      setSourceText(pendingNewRestore.sourceText);
      setEditorMode('source');
    }
    setPristine(true);

    const openedDraft = openedDraftRef.current;
    if (openedDraft && openedDraft.isNew === isNew && normalizeRepoPath(openedDraft.path) === normalizeRepoPath(path)) {
      openedDraftRef.current = null;
      const restored = restoreToEditorState(draftToBackup(openedDraft), source.text);
      setRawInner(restored.rawInner);
      setHasFrontmatter(restored.hasFrontmatter);
      setBody(restored.body);
      setForm({ ...restored.form });
      setFmError(restored.fmError);
      setSourceText(restored.sourceText);
      setOriginalData(isNew ? parsed.data : restored.originalData);
      setLoadedSha(isNew ? '' : restored.loadedSha);
      setEditorMode(restored.mode);
      setDirty(true);
      setPristine(false);
      setDraftSavedAt(openedDraft.savedAt);
      draftLoadedRef.current = true;
    }
  }, [isNew, pendingDraft, file.data, path, fields, draftReady]);

  const sourceActive = editorMode === 'source';
  const sourceParsed = useMemo(() => parseDocument(sourceText), [sourceText]);
  const frontmatterData = sourceActive ? sourceParsed.data : originalData;
  const effectiveBody = sourceActive ? sourceParsed.body : body;
  const yamlBroken = sourceActive ? Boolean(sourceParsed.frontmatterError) : Boolean(fmError);
  const missingRequired = sourceActive ? missingRequiredFieldNames(fields, sourceParsed.data) : [];

  const currentTitle = sourceActive
    ? typeof sourceParsed.data.title === 'string'
      ? sourceParsed.data.title.trim()
      : ''
    : (typeof form.title === 'string' ? form.title.trim() : '') ||
      (typeof originalData.title === 'string' ? originalData.title.trim() : '');
  const messageSourceKey = `${path ?? ''}|${isNew}|${settings.commit.create}|${settings.commit.update}|${config.timezone}`;
  const defaultMessage = useMemo(() => {
    if (!path) return '';
    const template = isNew ? settings.commit.create : settings.commit.update;
    return renderCommitMessage(template, {
      path,
      action: isNew ? 'create' : 'update',
      date: formatInTimeZone(new Date(), config.timezone),
      title: resolveCommitTitle(currentTitle, path),
    });
  }, [path, isNew, settings.commit.create, settings.commit.update, config.timezone, currentTitle]);

  useEffect(() => {
    if (messageSourceRef.current !== messageSourceKey) {
      messageSourceRef.current = messageSourceKey;
      setMessageEdited(false);
      setMessage(defaultMessage);
    } else if (!messageEdited) {
      setMessage(defaultMessage);
    }
  }, [messageSourceKey, defaultMessage, messageEdited]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  useEffect(() => {
    useEditorGuard.getState().setDirty(dirty);
    return () => useEditorGuard.getState().setDirty(false);
  }, [dirty]);

  const backupEnabled = settings.editor.backupUnsaved;
  const repoKey = backupRepoKey(mode, repo);

  // Opening from the draft box: read the explicit draft once, then let the
  // load effect apply its full editor state over the remote/pending source.
  useEffect(() => {
    if (!draftRequested || !path) return;
    let cancelled = false;
    void Promise.all([readDraft(repoKey, path), readBackup(repoKey, path).catch(() => null)]).then(([record, backup]) => {
      if (cancelled) return;
      // Edits made after opening a draft live in the autosave backup; when
      // that copy is newer — or the only copy — restore it instead of
      // silently losing the latest work.
      const chosen =
        backup && backup.isNew === isNew && (!record || record.isNew !== isNew || backup.savedAt > record.savedAt)
          ? draftFromBackup(backup)
          : record;
      if (chosen && chosen.isNew === isNew && normalizeRepoPath(chosen.path) === normalizeRepoPath(path)) {
        openedDraftRef.current = chosen;
        setDraftSavedAt(chosen.savedAt);
        if (chosen.isNew) {
          const live = usePendingPost.getState().draft;
          if (!live || normalizeRepoPath(live.path) !== normalizeRepoPath(chosen.path)) {
            usePendingPost.getState().setDraft({ path: chosen.path, text: chosen.text });
          }
        }
      }
      setDraftReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [draftRequested, path, repoKey, isNew]);

  const backupSnapshot = useMemo<BackupSnapshot | null>(() => {
    if (!backupEnabled || !path || !dirty || saving || draftLost) return null;
    const snapshotMode = sourceActive ? 'source' : 'form';
    return {
      path,
      isNew,
      baseSha: isNew ? '' : loadedSha,
      mode: snapshotMode,
      text: buildBackupText({
        mode: snapshotMode,
        sourceText,
        meta,
        rawInner,
        body,
        hasFrontmatter,
        fields,
        form,
        originalData,
      }),
      state: { body, rawInner, hasFrontmatter, fmError, form, sourceText },
    };
  }, [
    backupEnabled,
    path,
    dirty,
    saving,
    draftLost,
    isNew,
    loadedSha,
    sourceActive,
    sourceText,
    meta,
    rawInner,
    body,
    hasFrontmatter,
    fmError,
    form,
    fields,
    originalData,
  ]);

  const backup = useEditorBackup({
    enabled: backupEnabled,
    repoKey,
    path,
    isNew,
    ready: isNew ? true : Boolean(file.data) && !file.error && !file.isFetching,
    // Opening a draft is an explicit choice; a crash backup must not cover it.
    skipPrompt: (isNew && pendingDraft?.path === path) || draftRequested,
    snapshot: backupSnapshot,
  });

  const backupFailureNotified = useRef(false);
  useEffect(() => {
    if (backup.status !== 'failed' || backupFailureNotified.current) return;
    backupFailureNotified.current = true;
    toast.error(t('editor.backup.failedTitle'), {
      description: backup.failure === 'too-large' ? t('editor.backup.failedTooLarge') : t('editor.backup.failedStorage'),
    });
  }, [backup.status, backup.failure, t]);

  const extraFields = useMemo(() => {
    const configured = new Set(fields.map((field) => field.name));
    return Object.keys(frontmatterData).filter((field) => !configured.has(field));
  }, [frontmatterData, fields]);

  const isTrue = (name: string): boolean => (sourceActive ? frontmatterData[name] === true : form[name] === true);

  const markDirty = (): void => {
    setDirty(true);
    setPristine(false);
    setSaveOpen(false);
  };

  const leaveEditor = async (): Promise<void> => {
    if (dirty) {
      const leave = await confirmAction(t('editor.leave.title'), {
        description: t('editor.leave.description'),
        confirmLabel: t('editor.leave.confirm'),
        cancelLabel: t('editor.leave.cancel'),
        danger: true,
      });
      if (!leave) return;
    }
    navigate('/');
  };

  const updateField = (name: string, value: FrontmatterFormValue): void => {
    setForm((previous) => ({ ...previous, [name]: value }));
    setFieldErrors((previous) => {
      if (!previous[name]) return previous;
      const next = { ...previous };
      delete next[name];
      return next;
    });
    markDirty();
  };

  const buildText = (options: { autoUpdatedAt?: boolean } = {}): { text: string; errors: Record<string, string> } => {
    if (sourceActive) {
      // Source mode writes the whole file back, byte for byte apart from BOM/EOL.
      return { text: composeSourceDocument({ text: sourceText, meta }), errors: {} };
    }
    if (fmError) {
      return {
        text: composeDocument({ meta, frontmatterRaw: rawInner, body, includeFrontmatter: hasFrontmatter }),
        errors: {},
      };
    }
    const autoUpdatedAt =
      options.autoUpdatedAt !== false && settings.editor.updateUpdatedAt && dirty
        ? formatInTimeZone(new Date(), config.timezone)
        : undefined;
    const { patch, errors } = buildFrontmatterPatch(fields, form, originalData, { autoUpdatedAt });
    if (Object.keys(errors).length) return { text: '', errors };
    const raw = updateFrontmatterRaw(rawInner, patch);
    return {
      text: composeDocument({
        meta,
        frontmatterRaw: raw,
        body,
        includeFrontmatter: hasFrontmatter || Object.keys(patch).length > 0,
      }),
      errors: {},
    };
  };

  const switchToSource = (): void => {
    if (sourceActive) return;
    let text = originalText;
    if (!pristine) {
      const built = buildText({ autoUpdatedAt: false });
      if (Object.keys(built.errors).length) {
        setFieldErrors(built.errors);
        toast.error(t('editor.form.invalidTitle'), { description: t('editor.form.invalidDescription') });
        return;
      }
      text = built.text;
    }
    setSourceText(toEditingText(text));
    setEditorMode('source');
  };

  const switchToForm = (): void => {
    if (!sourceActive) return;
    const parsed = parseDocument(sourceText);
    setRawInner(parsed.frontmatterRaw);
    setHasFrontmatter(parsed.hasFrontmatter);
    setBody(parsed.body.replace(/\r\n?/g, '\n'));
    setForm(formValuesFromData(fields, parsed.data));
    setOriginalData(parsed.data);
    setFmError(parsed.frontmatterError ?? null);
    setFieldErrors({});
    setEditorMode('form');
  };

  const handleRestoreBackup = (record: BackupRecord): void => {
    if (record.isNew) {
      pendingNewRestoreRef.current =
        record.mode === 'source' ? { path: path ?? record.path, sourceText: record.state.sourceText } : null;
      usePendingPost.getState().setDraft({ path: path ?? record.path, text: record.text });
      setDraftLost(false);
      backup.acknowledgeRestored();
      toast.success(t('editor.backup.restoredNewTitle'), { description: t('editor.backup.restoredNewDescription') });
      return;
    }

    const remoteText = file.data?.text ?? originalText;
    const restored = restoreToEditorState(record, remoteText);
    setBody(restored.body);
    setRawInner(restored.rawInner);
    setHasFrontmatter(restored.hasFrontmatter);
    setFmError(restored.fmError);
    setForm({ ...restored.form });
    setSourceText(restored.sourceText);
    setOriginalData(restored.originalData);
    setLoadedSha(restored.loadedSha);
    setEditorMode(restored.mode);
    setDirty(true);
    setPristine(false);
    setSaveOpen(false);
    setConflictOpen(false);
    setMoveOpen(false);
    setFieldErrors({});
    backup.acknowledgeRestored();
    toast.success(t('editor.backup.restoredTitle'), { description: t('editor.backup.restoredDescription') });
  };

  const handleDiscardBackup = (): void => {
    void backup.discard().then(() => toast.success(t('editor.backup.discarded')));
  };

  const handleDeferBackup = (): void => {
    backup.defer();
  };

  /** After a commit/move/delete the explicit local draft is obsolete. */
  const clearLocalDraft = async (): Promise<void> => {
    if (!path) return;
    await removeDraft(repoKey, path);
    useDrafts.getState().forget(repoKey, path);
    setDraftSavedAt(null);
    draftLoadedRef.current = false;
  };

  const handleSaveDraft = async (): Promise<void> => {
    if (!path || draftSaving) return;
    setDraftSaving(true);
    try {
      const text = buildBackupText({
        mode: editorMode,
        sourceText,
        meta,
        rawInner,
        body,
        hasFrontmatter,
        fields,
        form,
        originalData,
      });
      const record: DraftRecord = {
        version: 1,
        repoKey,
        path,
        title: currentTitle || path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '') || t('editor.draft.noTitle'),
        isNew,
        baseSha: isNew ? '' : loadedSha,
        mode: editorMode,
        savedAt: Date.now(),
        size: text.length,
        text,
        state: { body, rawInner, hasFrontmatter, fmError, form, sourceText },
      };
      const result = await writeDraft(record);
      if (result === 'saved') {
        setDraftSavedAt(record.savedAt);
        draftLoadedRef.current = true;
        useDrafts.getState().remember(record);
        toast.success(t('editor.draft.savedTitle'), {
          description: mode === 'demo' ? t('editor.draft.savedDemoDescription') : t('editor.draft.savedLiveDescription'),
        });
        return;
      }
      if (result === 'locked') {
        toast.error(t('editor.draft.lockedTitle'), { description: t('editor.draft.lockedDescription') });
        return;
      }
      if (result === 'too-large') {
        toast.error(t('editor.draft.tooLargeTitle'), { description: t('editor.draft.tooLargeDescription') });
        return;
      }
      toast.error(t('editor.draft.failedTitle'), { description: t('editor.draft.failedDescription') });
    } finally {
      setDraftSaving(false);
    }
  };

  const applySaved = async (result: { sha: string; contentSha?: string; htmlUrl?: string }, text: string): Promise<void> => {
    const wasNew = isNew;
    setDirty(false);
    setPristine(true);
    setOriginalText(text);
    setSourceText(toEditingText(text));
    setSaveOpen(false);
    setConflictOpen(false);
    setFieldErrors({});
    await backup.markSaved();
    if (wasNew || draftLoadedRef.current) await clearLocalDraft();
    if (result.contentSha) setLoadedSha(result.contentSha);
    if (path) {
      queryClient.setQueryData(['file', key, path], {
        path,
        text,
        sha: result.contentSha ?? loadedSha,
        size: new Blob([text]).size,
      });
    }
    await queryClient.invalidateQueries({ queryKey: ['tree', key] });
    setLastCommit({
      sha: result.sha,
      message,
      path: path ?? '',
      at: Date.now(),
      ...(result.htmlUrl ? { htmlUrl: result.htmlUrl } : {}),
    });
    if (wasNew) {
      navigate(`/edit?path=${encodeURIComponent(path ?? '')}`, { replace: true });
      usePendingPost.getState().clearDraft();
      toast.success(t('editor.commit.createdToast'));
    } else {
      toast.success(t('editor.commit.submittedToast'));
    }
  };

  const performSave = async (overrideSha?: string): Promise<void> => {
    if (!path) return;
    const { text, errors } = buildText();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      toast.error(t('editor.frontmatter.invalidError'), { description: t('editor.frontmatter.invalidDescription') });
      return;
    }
    setSaving(true);
    setStamping(true);
    window.setTimeout(() => setStamping(false), 900);
    try {
      const result = await gateway.writeFile({
        path,
        text,
        message,
        branch: repo.defaultBranch,
        ...(isNew ? {} : { sha: overrideSha ?? loadedSha }),
      });
      await applySaved(result, text);
    } catch (caught) {
      const error = mapError(caught);
      if (error.code === 'CONFLICT') {
        if (isNew) {
          toast.error(t('editor.commit.nameConflictTitle'), { description: t('editor.commit.nameConflictDescription') });
        } else {
          setConflictOpen(true);
        }
      } else {
        toast.error(error.message, { description: error.detail });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (): void => {
    if (settings.commit.confirmBeforeCommit) setSaveOpen(true);
    else void performSave();
  };

  const handleOverwrite = async (): Promise<void> => {
    if (!path || isNew) return;
    const { text, errors } = buildText();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      toast.error(t('editor.frontmatter.invalidError'));
      return;
    }
    try {
      const latest = await gateway.readFile(path);
      const result = await gateway.writeFile({
        path,
        text,
        message,
        branch: repo.defaultBranch,
        sha: latest.sha,
      });
      await applySaved(result, text);
      toast.success(t('editor.commit.overwrittenToast'));
    } catch (caught) {
      toast.error(mapError(caught).message);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!path || isNew) return;
    try {
      await gateway.deleteFile({
        path,
        message: renderCommitMessage(settings.commit.delete, {
          path,
          action: 'delete',
          date: formatInTimeZone(new Date(), config.timezone),
          title: resolveCommitTitle(currentTitle, path),
        }),
        branch: repo.defaultBranch,
        sha: loadedSha,
      });
      await backup.markSaved();
      await clearLocalDraft();
      await queryClient.invalidateQueries({ queryKey: ['tree', key] });
      toast.success(t('editor.commit.deletedToast'));
      navigate('/');
    } catch (caught) {
      toast.error(mapError(caught).message);
    }
  };

  const handleMove = async (): Promise<void> => {
    if (!path || isNew) return;
    const target = joinPath(normalizeRepoPath(moveTarget));
    if (!target || target === path) {
      setMoveError(t('editor.move.samePath'));
      return;
    }
    setMoveError(null);
    try {
      const { text, errors } = buildText();
      if (Object.keys(errors).length) {
        setMoveError(t('editor.frontmatter.invalidError'));
        return;
      }
      const result = await gateway.moveFile({
        from: path,
        to: target,
        text,
        message: renderCommitMessage(settings.commit.move, {
          path: target,
          oldPath: path,
          newPath: target,
          action: 'move',
          date: formatInTimeZone(new Date(), config.timezone),
          title: resolveCommitTitle(currentTitle, target),
        }),
        branch: repo.defaultBranch,
        sha: loadedSha,
      });
      setLastCommit({
        sha: result.sha,
        message: result.message,
        path: target,
        at: Date.now(),
        ...(result.htmlUrl ? { htmlUrl: result.htmlUrl } : {}),
      });
      await backup.markSaved();
      await clearLocalDraft();
      await queryClient.invalidateQueries({ queryKey: ['tree', key] });
      toast.success(t('editor.commit.movedToast'));
      setMoveOpen(false);
      navigate(`/edit?path=${encodeURIComponent(target)}`);
    } catch (caught) {
      setMoveError(mapError(caught).detail ?? mapError(caught).message);
    }
  };

  if (!path) return <Navigate to="/" replace />;

  const candidate = backup.candidate;
  const candidateSavedAtLabel = candidate ? formatInTimeZone(new Date(candidate.savedAt), config.timezone) : '';
  const candidateCharCount = candidate ? backupCharCount(candidate.text) : 0;
  const backupStatusLabel =
    backup.status === 'saved' && backup.savedAt
      ? t('editor.backup.savedAt', { time: formatInTimeZone(new Date(backup.savedAt), config.timezone).slice(11, 16) })
      : backup.status === 'pending'
        ? t('editor.backup.pending')
        : backup.status === 'failed'
          ? t('editor.backup.failed')
          : '';
  const draftUnavailable = isNew && (!pendingDraft || pendingDraft.path !== path);
  const waitingForDraft = draftRequested && !draftReady;

  if ((draftUnavailable && backup.checking) || waitingForDraft) {
    return (
      <div className="abs-paper p-6">
        <Spinner label={draftRequested ? t('editor.draft.reading') : t('editor.backup.checking')} />
      </div>
    );
  }

  if (draftUnavailable) {
    return (
      <>
        <div className="abs-paper mx-auto max-w-[620px] p-6">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-sakura">{t('editor.draft.lostEyebrow')}</p>
          <h1 className="mt-1 font-display text-[24px] font-bold">{t('editor.draft.lostTitle')}</h1>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{t('editor.draft.lostDescription')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="abs-btn abs-btn-primary text-[11px]" onClick={() => navigate('/')}>
              <ArrowLeft aria-hidden className="size-3.5" />
              {t('editor.draft.lostNew')}
            </button>
            <button type="button" className="abs-btn abs-btn-ghost text-[11px]" onClick={() => navigate('/?drafts=1')}>
              {t('editor.draft.lostOpenBox')}
            </button>
          </div>
        </div>
        {candidate ? (
          <BackupDialog
            backup={candidate}
            open={!backup.deferred}
            allowDefer={false}
            remoteChanged={false}
            savedAtLabel={candidateSavedAtLabel}
            charCount={candidateCharCount}
            onRestore={() => handleRestoreBackup(candidate)}
            onDiscard={handleDiscardBackup}
            onDefer={handleDeferBackup}
          />
        ) : null}
      </>
    );
  }

  if (!isNew && file.isLoading) {
    return (
      <div className="abs-paper p-6">
        <Spinner label={t('editor.readingFile')} />
      </div>
    );
  }

  if (!isNew && file.error) {
    return (
      <div className="space-y-3">
        <ErrorNote error={file.error} onRetry={() => void file.refetch()} />
        <button type="button" className="abs-btn" onClick={() => navigate('/')}>
          <ArrowLeft aria-hidden className="size-3.5" />
          {t('editor.backToDashboard')}
        </button>
      </div>
    );
  }

  const rendered = renderMarkdown(effectiveBody);
  const words = effectiveBody.replace(/\s+/g, '').length;
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  const githubUrl = isNew
    ? undefined
    : `${repo.htmlUrl}/blob/${repo.defaultBranch}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const isDemo = mode === 'demo';
  const hasUpdatedField = fields.some((field) => field.name === 'updated' && field.type === 'date');
  const updatedFieldHint = fieldErrors.updated
    ? t('editor.frontmatter.updatedFormatError')
    : settings.editor.updateUpdatedAt
      ? t('editor.frontmatter.updatedAutoHint')
      : t('editor.frontmatter.updatedManualHint');

  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-3">
        <header className="abs-paper min-w-0 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <button
                type="button"
                className="abs-icon-btn mt-0.5"
                onClick={() => void leaveEditor()}
                aria-label={t('editor.backToDashboard')}
              >
                <ArrowLeft aria-hidden className="size-3.5" />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1 className="truncate font-display text-[18px] font-bold leading-tight">{fileName}</h1>
                  {isNew ? (
                    <Badge tone="blush">{t('editor.status.uncommitted')}</Badge>
                  ) : dirty ? (
                    <Badge tone="blush">{t('editor.status.unsaved')}</Badge>
                  ) : (
                    <Badge tone="mint">{t('editor.status.saved')}</Badge>
                  )}
                  {isTrue('draft') ? <Badge tone="butter">{t('editor.status.draftBadge')}</Badge> : null}
                  {isTrue('sticky') ? <Badge tone="mint">{t('editor.status.stickyBadge')}</Badge> : null}
                  {yamlBroken ? <Badge tone="blush">{t('editor.status.yamlBadge')}</Badge> : null}
                </div>
                <p className="mt-0.5 truncate font-mono text-[9px] text-muted">{path}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="abs-btn abs-btn-ghost h-8 text-[10.5px]"
                onClick={() => void handleSaveDraft()}
                disabled={draftSaving || saving}
                aria-busy={draftSaving}
                title={t('editor.draft.saveTooltip')}
              >
                <Save aria-hidden className="size-3" />
                {draftSaving ? t('editor.draft.saving') : t('editor.draft.save')}
              </button>
              {githubUrl ? (
                <a
                  className="abs-btn abs-btn-ghost h-8 text-[10.5px]"
                  href={githubUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  GitHub
                  <ArrowUpRight aria-hidden className="size-3" />
                </a>
              ) : null}
              {!isNew ? (
                <>
                  <button
                    type="button"
                    className="abs-btn abs-btn-ghost h-8 text-[10.5px]"
                    onClick={() => {
                      setMoveTarget(path);
                      setMoveError(null);
                      setMoveOpen(true);
                    }}
                  >
                    <MoveRight aria-hidden className="size-3" />
                    {t('editor.move.button')}
                  </button>
                  <button
                    type="button"
                    className="abs-btn abs-btn-ghost h-8 border-danger/40 text-[10.5px] text-danger"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 aria-hidden className="size-3" />
                    {t('editor.delete.button')}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </header>

        {candidate && backup.deferred ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-butter bg-butter/40 px-3 py-2 text-[10.5px] text-ink-soft">
            <span className="font-semibold text-ink">{t('editor.backup.banner', { time: candidateSavedAtLabel })}</span>
            <span className="text-muted">{t('editor.backup.bannerHint')}</span>
            <button type="button" className="abs-btn h-7 px-2.5 text-[10.5px]" onClick={() => handleRestoreBackup(candidate)}>
              {t('editor.backup.restore')}
            </button>
            <button type="button" className="abs-btn abs-btn-ghost h-7 px-2.5 text-[10.5px]" onClick={handleDiscardBackup}>
              {t('editor.backup.discard')}
            </button>
          </div>
        ) : null}

        {sourceActive ? null : (
          <section className="abs-paper relative p-3.5">
            <span className="abs-tape" aria-hidden />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">frontmatter</span>
              <span className="font-mono text-[9px] text-muted">
                {isNew
                  ? t('editor.frontmatter.newFile')
                  : hasFrontmatter
                    ? t('editor.frontmatter.fieldsCount', { count: Object.keys(originalData).length })
                    : t('editor.frontmatter.none')}
                {extraFields.length ? ` · ${t('editor.frontmatter.unknownKept', { count: extraFields.length })}` : ''}
              </span>
            </div>

            {fmError ? (
              <div className="mt-2 space-y-2">
                <p className="flex items-start gap-1.5 text-[11px] text-danger">
                  <FileWarning aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  {t('editor.frontmatter.yamlError', { error: fmError })}
                </p>
                <textarea
                  className="abs-textarea min-h-[150px] font-mono text-[11px]"
                  value={rawInner}
                  onChange={(event) => {
                    setRawInner(event.target.value);
                    markDirty();
                  }}
                  aria-label={t('editor.frontmatter.rawAria')}
                />
                <p className="text-[10px] text-muted">{t('editor.frontmatter.yamlErrorHint')}</p>
              </div>
            ) : (
              <>
                <FrontmatterForm fields={fields} values={form} errors={fieldErrors} onChange={updateField} />
                <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[9px] text-muted">
                  <span>{t('editor.frontmatter.eolKept', { eol: meta.eol === '\r\n' ? 'CRLF' : 'LF' })}</span>
                  {hasUpdatedField ? <span>{updatedFieldHint}</span> : null}
                  {isNew ? <span className="text-sakura">{t('editor.frontmatter.firstSaveOnce')}</span> : null}
                </div>
              </>
            )}
          </section>
        )}

        <section className="abs-sheet min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
              {sourceActive ? t('editor.editorMode.sourceSheetLabel') : 'markdown'}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[9px] text-muted">
                {t('common.units.words', { count: words.toLocaleString(locale) })}
                {' · '}
                {t('editor.readingTime', { count: Math.max(1, Math.round(words / 300)) })}
              </span>
              <fieldset className="abs-seg" aria-label={t('editor.editorMode.label')}>
                <legend className="sr-only">{t('editor.editorMode.label')}</legend>
                <button
                  type="button"
                  aria-pressed={!sourceActive}
                  title={t('editor.editorMode.formTitle')}
                  onClick={switchToForm}
                >
                  {t('editor.editorMode.form')}
                </button>
                <button
                  type="button"
                  aria-pressed={sourceActive}
                  title={t('editor.editorMode.sourceTitle')}
                  onClick={switchToSource}
                >
                  {t('editor.editorMode.source')}
                </button>
              </fieldset>
            </div>
          </div>
          {sourceActive && sourceParsed.frontmatterError ? (
            <p className="flex items-start gap-1.5 border-b border-line-soft bg-butter/50 px-3 py-1.5 text-[10px] leading-relaxed text-warning">
              <FileWarning aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {t('editor.frontmatter.sourceYamlError', { error: sourceParsed.frontmatterError })}
            </p>
          ) : null}
          <div className="min-w-0 px-2">
            <CodeMirror
              key={editorMode}
              value={sourceActive ? sourceText : body}
              height="520px"
              theme={createEditorTheme(settings.editor.fontSize, resolvedTheme === 'night')}
              extensions={markdownEditorExtensions}
              basicSetup={{
                lineNumbers: settings.editor.showLineNumbers,
                foldGutter: false,
                highlightActiveLine: true,
                autocompletion: true,
                bracketMatching: true,
                closeBrackets: true,
                syntaxHighlighting: false,
              }}
              onChange={(value) => {
                if (sourceActive) {
                  if (value === sourceText) return;
                  setSourceText(value);
                  markDirty();
                  return;
                }
                if (value === body) return;
                setBody(value);
                markDirty();
              }}
            />
          </div>
          <footer className="flex flex-wrap items-end justify-between gap-3 border-t border-line-soft px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-mono text-[9px] text-muted">{path}</p>
              <p className="mt-0.5 flex items-center gap-2 font-mono text-[9px] text-muted">
                {meta.mixed ? (
                  <span className="text-warning">
                    {t('editor.status.mixedEol', { eol: meta.eol === '\r\n' ? 'CRLF' : 'LF' })}
                  </span>
                ) : null}
                {!isDemo && !repo.canPush ? <span className="text-danger">{t('editor.status.readOnly')}</span> : null}
                {backupEnabled && dirty && backup.status !== 'idle' ? (
                  <span className={backup.status === 'failed' ? 'text-warning' : undefined}>{backupStatusLabel}</span>
                ) : null}
                {draftSavedAt ? (
                  <span className="text-muted">
                    {t('editor.draft.savedAt', {
                      time: formatInTimeZone(new Date(draftSavedAt), config.timezone).slice(11, 16),
                    })}
                  </span>
                ) : null}
              </p>
              {sourceActive ? (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[9px] text-muted">
                  <span>{t('editor.frontmatter.eolKept', { eol: meta.eol === '\r\n' ? 'CRLF' : 'LF' })}</span>
                  {sourceParsed.frontmatterError ? null : (
                    <span>
                      {sourceParsed.hasFrontmatter
                        ? t('editor.frontmatter.fieldsCount', { count: Object.keys(sourceParsed.data).length })
                        : t('editor.frontmatter.noFrontmatter')}
                    </span>
                  )}
                  {extraFields.length ? (
                    <span>{t('editor.frontmatter.unknownKept', { count: extraFields.length })}</span>
                  ) : null}
                  {missingRequired.length ? (
                    <span className="text-warning">
                      {t('editor.frontmatter.missingRequired', {
                        names: missingRequired.join(t('editor.frontmatter.listSeparator')),
                      })}
                    </span>
                  ) : null}
                  {settings.editor.updateUpdatedAt && hasUpdatedField ? (
                    <span>{t('editor.frontmatter.sourceNoUpdated')}</span>
                  ) : null}
                  {isNew ? <span className="text-sakura">{t('editor.frontmatter.firstSaveOnce')}</span> : null}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {isNew ? (
                <span className="text-[10px] font-bold text-sakura">{t('editor.status.uncommitted')}</span>
              ) : dirty ? (
                <span className="text-[10px] font-bold text-sakura">{t('editor.status.unsaved')}</span>
              ) : (
                <span className="text-[10px] text-muted">{t('editor.status.saved')}</span>
              )}
              <Popover.Root open={saveOpen} onOpenChange={setSaveOpen}>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="abs-stamp"
                    data-stamping={stamping ? 'true' : 'false'}
                    onClick={(event) => {
                      if (!settings.commit.confirmBeforeCommit) {
                        event.preventDefault();
                        handleSave();
                      }
                    }}
                    disabled={saving || !repo.canPush}
                    aria-label={isNew ? t('editor.commit.createAria') : t('editor.commit.saveAria')}
                  >
                    {t('editor.commit.stampTop')}
                    <br />
                    {t('editor.commit.stampBottom')}
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    side="top"
                    align="end"
                    sideOffset={10}
                    className="z-50 w-[340px] max-w-[calc(100vw-24px)] rounded-xl border-[1.5px] border-edge bg-paper p-3 shadow-pop outline-none"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-[13px] font-bold">{t('editor.commit.sectionTitle')}</span>
                      <Popover.Close className="abs-icon-btn size-6" aria-label={t('common.close')}>
                        <X aria-hidden className="size-3" />
                      </Popover.Close>
                    </div>
                    <textarea
                      className="abs-textarea mt-2 min-h-[64px] font-mono text-[10px]"
                      value={message}
                      onChange={(event) => {
                        setMessage(event.target.value);
                        setMessageEdited(true);
                      }}
                      aria-label={t('editor.commit.messageAria')}
                    />
                    <p className="mt-1.5 font-mono text-[9px] text-muted">
                      {t('editor.commit.summary', {
                        branch: repo.defaultBranch,
                        commits: isNew ? t('editor.commit.createCommits') : t('editor.commit.oneCommit'),
                        change: dirty ? t('editor.commit.dirty') : t('editor.commit.clean'),
                      })}
                      {sourceActive ? t('editor.commit.sourceSuffix') : ''}
                    </p>
                    <button
                      type="button"
                      className="abs-btn abs-btn-primary mt-2.5 w-full text-[11px]"
                      onClick={() => void performSave()}
                      disabled={saving}
                    >
                      <Check aria-hidden className="size-3.5" />
                      {saving
                        ? t('editor.commit.submitting')
                        : isNew
                          ? t('editor.commit.confirmCreate')
                          : t('editor.commit.confirmStamp')}
                    </button>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
          </footer>
        </section>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-[76px] xl:self-start">
        <div className="abs-paper flex max-h-[calc(100vh-96px)] min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">{t('editor.preview.live')}</span>
            <span className="flex items-center gap-1 font-mono text-[9px] text-success">
              <span className="size-1.5 rounded-full bg-success" />
              {rendered.warnings.length ? t('editor.preview.warnings', { count: rendered.warnings.length }) : 'OK'}
            </span>
          </div>
          {rendered.warnings.length ? (
            <p className="border-b border-line-soft bg-butter/50 px-3 py-1.5 text-[9.5px] leading-relaxed text-warning">
              {rendered.warnings.join(' · ')}
            </p>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="abs-preview" dangerouslySetInnerHTML={{ __html: rendered.html }} />
          </div>
        </div>
      </aside>

      <Dialog.Root open={conflictOpen} onOpenChange={setConflictOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--abs-overlay)] backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[1.5px] border-edge bg-paper p-5 shadow-pop">
            <Dialog.Title className="font-display text-[20px] font-bold">{t('editor.conflict.title')}</Dialog.Title>
            <Dialog.Description className="mt-1 text-[11px] leading-relaxed text-muted">
              {t('editor.conflict.description')}
            </Dialog.Description>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="abs-btn text-[11px]"
                onClick={() => {
                  setConflictOpen(false);
                  void file.refetch();
                }}
              >
                {t('editor.conflict.reload')}
              </button>
              <button type="button" className="abs-btn abs-btn-primary text-[11px]" onClick={() => void handleOverwrite()}>
                {t('editor.conflict.overwrite')}
              </button>
              <button type="button" className="abs-btn abs-btn-ghost text-[11px]" onClick={() => setConflictOpen(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={moveOpen} onOpenChange={setMoveOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--abs-overlay)] backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[1.5px] border-edge bg-paper p-5 shadow-pop">
            <Dialog.Title className="font-display text-[20px] font-bold">{t('editor.move.title')}</Dialog.Title>
            <Dialog.Description className="mt-1 text-[11px] text-muted">{t('editor.move.description')}</Dialog.Description>
            <Field label={t('editor.move.targetLabel')} className="mt-4">
              <input
                className="abs-input font-mono text-[11px]"
                value={moveTarget}
                onChange={(event) => setMoveTarget(event.target.value)}
              />
            </Field>
            {moveError ? <p className="mt-2 text-[11px] text-danger">{moveError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="abs-btn abs-btn-ghost text-[11px]" onClick={() => setMoveOpen(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="abs-btn abs-btn-primary text-[11px]" onClick={() => void handleMove()}>
                {t('editor.move.submit')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AlarmDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlarmDialog.Portal>
          <AlarmDialog.Overlay className="fixed inset-0 z-50 bg-[var(--abs-overlay)] backdrop-blur-[2px]" />
          <AlarmDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[1.5px] border-edge bg-paper p-5 shadow-pop">
            <AlarmDialog.Title className="font-display text-[20px] font-bold text-danger">
              {t('editor.delete.title')}
            </AlarmDialog.Title>
            <AlarmDialog.Description className="mt-1 break-all font-mono text-[10px] leading-relaxed text-muted">
              {path}
            </AlarmDialog.Description>
            <p className="mt-3 text-[11px] text-ink-soft">{t('editor.delete.description', { branch: repo.defaultBranch })}</p>
            <div className="mt-4 flex justify-end gap-2">
              <AlarmDialog.Cancel className="abs-btn abs-btn-ghost text-[11px]">{t('common.cancel')}</AlarmDialog.Cancel>
              <AlarmDialog.Action
                className="abs-btn border-danger bg-danger text-[11px] text-[var(--abs-on-danger)]"
                onClick={() => void handleDelete()}
              >
                {t('editor.delete.submit')}
              </AlarmDialog.Action>
            </div>
          </AlarmDialog.Content>
        </AlarmDialog.Portal>
      </AlarmDialog.Root>

      {candidate ? (
        <BackupDialog
          backup={candidate}
          open={!backup.deferred}
          allowDefer
          remoteChanged={backupRemoteChanged(candidate, file.data?.sha ?? null)}
          savedAtLabel={candidateSavedAtLabel}
          charCount={candidateCharCount}
          onRestore={() => handleRestoreBackup(candidate)}
          onDiscard={handleDiscardBackup}
          onDefer={handleDeferBackup}
        />
      ) : null}
    </div>
  );
}
