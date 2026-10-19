import { useCallback, useEffect, useRef, useState } from 'react';
import { registerBackupFlush } from '@/lib/backup/flush';
import type { BackupRecord, BackupState } from '@/lib/backup/model';
import { type BackupWriteResult, readBackup, removeBackup, writeBackup } from '@/lib/backup/store';

export const BACKUP_DEBOUNCE_MS = 600;

export interface BackupSnapshot {
  path: string;
  isNew: boolean;
  baseSha: string;
  mode: 'form' | 'source';
  text: string;
  state: BackupState;
}

export type BackupStatus = 'idle' | 'pending' | 'saved' | 'failed';
export type BackupFailure = 'storage' | 'too-large' | null;

export interface EditorBackupController {
  candidate: BackupRecord | null;
  deferred: boolean;
  checking: boolean;
  status: BackupStatus;
  savedAt: number | null;
  failure: BackupFailure;
  defer: () => void;
  discard: () => Promise<void>;
  acknowledgeRestored: () => void;
  markSaved: () => Promise<void>;
}

export interface UseEditorBackupOptions {
  enabled: boolean;
  repoKey: string;
  path: string | null;
  isNew: boolean;
  /** The remote file (or the live new-post draft) is available to compare against. */
  ready: boolean;
  /** A live new-post draft already holds this content; no recovery prompt is needed. */
  skipPrompt: boolean;
  /** Built by the editor only while there are unsaved changes. */
  snapshot: BackupSnapshot | null;
  debounceMs?: number;
}

function toRecord(snapshot: BackupSnapshot, repoKey: string): BackupRecord {
  return {
    version: 1,
    repoKey,
    path: snapshot.path,
    isNew: snapshot.isNew,
    baseSha: snapshot.baseSha,
    mode: snapshot.mode,
    savedAt: Date.now(),
    size: snapshot.text.length,
    text: snapshot.text,
    state: snapshot.state,
  };
}

async function persist(snapshot: BackupSnapshot | null, repoKey: string): Promise<BackupWriteResult | null> {
  if (!snapshot) return null;
  return writeBackup(toRecord(snapshot, repoKey));
}

/**
 * Keeps a local recovery copy of the current unsaved editor state, checks for a
 * previous copy when the editor opens, and exposes the restore prompt state.
 *
 * The editor session is keyed by file path, so this hook is mounted once per
 * entry: the entry check runs once, and the unmount cleanup flushes the latest
 * snapshot before the next file replaces the editor.
 */
export function useEditorBackup(options: UseEditorBackupOptions): EditorBackupController {
  const { enabled, repoKey, path, isNew, ready, skipPrompt, snapshot } = options;
  const debounceMs = options.debounceMs ?? BACKUP_DEBOUNCE_MS;

  const [candidate, setCandidate] = useState<BackupRecord | null>(null);
  const [deferred, setDeferred] = useState(false);
  const [checking, setChecking] = useState(enabled);
  const [status, setStatus] = useState<BackupStatus>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [failure, setFailure] = useState<BackupFailure>(null);

  const snapshotRef = useRef<BackupSnapshot | null>(snapshot);
  const blockedRef = useRef(false);
  const suppressRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    blockedRef.current = Boolean(candidate) || deferred;
  }, [candidate, deferred]);

  // A fresh, non-null snapshot is a new edit session; allow writes again after
  // a save (which suppresses the unload flush).
  useEffect(() => {
    if (snapshot) suppressRef.current = false;
  }, [snapshot]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Entry check: once per mounted file session.
  useEffect(() => {
    if (!enabled || !path || !ready || skipPrompt) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    void readBackup(repoKey, path).then((record) => {
      if (cancelled) return;
      // The user already started editing this session; their newer work wins
      // over a prompt for the previous copy (which autosave will replace).
      if (record && record.isNew === isNew && !snapshotRef.current) setCandidate(record);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, repoKey, path, isNew, ready, skipPrompt]);

  // Debounced autosave. Paused while the recovery prompt is open or deferred so
  // the old copy is never overwritten before the user decides.
  useEffect(() => {
    if (!enabled || !path || !snapshot || candidate || deferred || suppressRef.current) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!snapshot) {
        setStatus('idle');
        setSavedAt(null);
        setFailure(null);
      }
      return;
    }

    setStatus('pending');
    setFailure(null);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (!mountedRef.current || suppressRef.current) return;
      const record = toRecord(snapshot, repoKey);
      void writeBackup(record).then((result) => {
        if (!mountedRef.current) return;
        if (result === 'saved') {
          setStatus('saved');
          setSavedAt(record.savedAt);
          setFailure(null);
        } else if (result === 'locked') {
          // The vault locked before this write: keep no plaintext fallback and
          // stay quiet (the lock flow already flushed what it could).
          setStatus('idle');
          setSavedAt(null);
          setFailure(null);
        } else {
          setStatus('failed');
          setFailure(result === 'too-large' ? 'too-large' : 'storage');
        }
      });
    }, debounceMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, path, snapshot, repoKey, candidate, deferred, debounceMs]);

  const flushNow = useCallback(async (): Promise<void> => {
    if (!enabled || !path || suppressRef.current || blockedRef.current) return;
    await persist(snapshotRef.current, repoKey);
  }, [enabled, path, repoKey]);

  // Locking calls this before the vault key is cleared, so the latest draft is
  // still stored as an encrypted backup.
  useEffect(() => {
    registerBackupFlush(flushNow);
    return () => registerBackupFlush(null);
  }, [flushNow]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') void flushNow();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [flushNow]);

  // Unmount-only flush: the session key changes when the user opens another file.
  useEffect(() => {
    return () => {
      if (!enabled || !path) return;
      if (suppressRef.current || blockedRef.current) return;
      void persist(snapshotRef.current, repoKey);
    };
  }, [enabled, path, repoKey]);

  const defer = useCallback(() => {
    setDeferred(true);
  }, []);

  const acknowledgeRestored = useCallback(() => {
    setCandidate(null);
    setDeferred(false);
  }, []);

  const discard = useCallback(async () => {
    setCandidate(null);
    setDeferred(false);
    setStatus('idle');
    setSavedAt(null);
    setFailure(null);
    if (path) await removeBackup(repoKey, path);
  }, [path, repoKey]);

  const markSaved = useCallback(async () => {
    suppressRef.current = true;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCandidate(null);
    setDeferred(false);
    setStatus('idle');
    setSavedAt(null);
    setFailure(null);
    if (path) await removeBackup(repoKey, path);
  }, [path, repoKey]);

  return { candidate, deferred, checking, status, savedAt, failure, defer, discard, acknowledgeRestored, markSaved };
}
