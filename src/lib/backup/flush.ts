type BackupFlush = () => Promise<void>;

let active: BackupFlush | null = null;

/**
 * The editor registers a flush while it is mounted. Locking flushes the latest
 * draft before the vault key is dropped, so an unsaved edit still lands as an
 * encrypted backup instead of silently disappearing.
 */
export function registerBackupFlush(flush: BackupFlush | null): void {
  active = flush;
}

/** Best effort and time-boxed: a stuck IndexedDB write must never block a lock. */
export async function flushActiveBackup(timeoutMs = 1500): Promise<void> {
  const flush = active;
  if (!flush) return;
  try {
    await Promise.race([
      flush(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    // Locking must continue even when the flush fails.
  }
}
