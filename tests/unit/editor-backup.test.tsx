// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type BackupSnapshot, type UseEditorBackupOptions, useEditorBackup } from '@/hooks/use-editor-backup';
import type { BackupRecord } from '@/lib/backup/model';
import { clearAllBackups, readBackup, writeBackup } from '@/lib/backup/store';

const REPO_KEY = 'demo:God-2077/astro-blog-content@main';
const PATH = 'src/content/blog/note/便笺.md';

function makeRecord(overrides: Partial<BackupRecord> = {}): BackupRecord {
  const text = '---\ntitle: OLD\n---\n\nold body\n';
  return {
    version: 1,
    repoKey: REPO_KEY,
    path: PATH,
    isNew: false,
    baseSha: 'sha-old',
    mode: 'form',
    savedAt: Date.now(),
    size: text.length,
    text,
    state: {
      body: 'old body\n',
      rawInner: 'title: OLD',
      hasFrontmatter: true,
      fmError: null,
      form: { title: 'OLD' },
      sourceText: text,
    },
    ...overrides,
  };
}

function makeSnapshot(text: string): BackupSnapshot {
  return {
    path: PATH,
    isNew: false,
    baseSha: 'sha-old',
    mode: 'form',
    text,
    state: {
      body: 'body\n',
      rawInner: 'title: NEW',
      hasFrontmatter: true,
      fmError: null,
      form: { title: 'NEW' },
      sourceText: text,
    },
  };
}

const baseOptions: UseEditorBackupOptions = {
  enabled: true,
  repoKey: REPO_KEY,
  path: PATH,
  isNew: false,
  ready: true,
  skipPrompt: false,
  snapshot: null,
  debounceMs: 20,
};

function Probe({ options }: { options: UseEditorBackupOptions }) {
  const backup = useEditorBackup(options);
  return (
    <div>
      <span data-testid="candidate">{backup.candidate?.path ?? ''}</span>
      <span data-testid="checking">{String(backup.checking)}</span>
      <span data-testid="status">{backup.status}</span>
      <span data-testid="deferred">{String(backup.deferred)}</span>
      <button type="button" onClick={backup.defer}>
        defer
      </button>
      <button type="button" onClick={backup.discard}>
        discard
      </button>
      <button type="button" onClick={() => void backup.markSaved()}>
        mark-saved
      </button>
      <button type="button" onClick={backup.acknowledgeRestored}>
        ack
      </button>
    </div>
  );
}

async function waitForStored(match: (record: BackupRecord | null) => void): Promise<void> {
  await waitFor(
    async () => {
      match(await readBackup(REPO_KEY, PATH));
    },
    { timeout: 3_000 },
  );
}

beforeEach(async () => {
  await clearAllBackups();
});

afterEach(cleanup);

describe('useEditorBackup', () => {
  it('offers a stored backup when the editor opens', async () => {
    await writeBackup(makeRecord());
    render(<Probe options={baseOptions} />);

    await waitFor(() => expect(screen.getByTestId('candidate').textContent).toBe(PATH));
    expect(screen.getByTestId('checking').textContent).toBe('false');
  });

  it('does not prompt while a live new-post draft owns the content', async () => {
    await writeBackup(makeRecord());
    render(<Probe options={{ ...baseOptions, skipPrompt: true }} />);

    await waitFor(() => expect(screen.getByTestId('checking').textContent).toBe('false'));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.getByTestId('candidate').textContent).toBe('');
  });

  it('writes the latest snapshot after the debounce', async () => {
    const { rerender } = render(<Probe options={baseOptions} />);
    await waitFor(() => expect(screen.getByTestId('checking').textContent).toBe('false'));

    rerender(<Probe options={{ ...baseOptions, snapshot: makeSnapshot('---\ntitle: NEW\n---\n\nnew body\n') }} />);

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('saved'));
    await waitForStored((record) => {
      expect(record?.text).toContain('title: NEW');
    });
  });

  it('never overwrites a pending recovery prompt, and stays paused after defer', async () => {
    await writeBackup(makeRecord());
    const { rerender } = render(<Probe options={baseOptions} />);
    await waitFor(() => expect(screen.getByTestId('candidate').textContent).toBe(PATH));

    rerender(<Probe options={{ ...baseOptions, snapshot: makeSnapshot('---\ntitle: FIRST\n---\n\nfirst\n') }} />);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await waitForStored((record) => {
      expect(record?.text).toContain('OLD');
    });

    fireEvent.click(screen.getByRole('button', { name: 'defer' }));
    await waitFor(() => expect(screen.getByTestId('deferred').textContent).toBe('true'));

    rerender(<Probe options={{ ...baseOptions, snapshot: makeSnapshot('---\ntitle: SECOND\n---\n\nsecond\n') }} />);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await waitForStored((record) => {
      expect(record?.text).toContain('OLD');
    });
  });

  it('deletes the record when the file is saved', async () => {
    await writeBackup(makeRecord());
    render(<Probe options={baseOptions} />);
    await waitFor(() => expect(screen.getByTestId('candidate').textContent).toBe(PATH));

    fireEvent.click(screen.getByRole('button', { name: 'mark-saved' }));
    await waitForStored((record) => {
      expect(record).toBeNull();
    });
    await waitFor(() => expect(screen.getByTestId('candidate').textContent).toBe(''));
  });

  it('flushes the latest snapshot on unmount', async () => {
    const { rerender, unmount } = render(<Probe options={baseOptions} />);
    await waitFor(() => expect(screen.getByTestId('checking').textContent).toBe('false'));

    rerender(
      <Probe options={{ ...baseOptions, debounceMs: 5_000, snapshot: makeSnapshot('---\ntitle: FLUSH\n---\n\nflush\n') }} />,
    );
    unmount();
    await waitForStored((record) => {
      expect(record?.text).toContain('title: FLUSH');
    });
  });

  it('is inert when disabled and keeps an existing record untouched', async () => {
    await writeBackup(makeRecord());
    render(
      <Probe
        options={{
          ...baseOptions,
          enabled: false,
          snapshot: makeSnapshot('---\ntitle: NEW\n---\n\nnew\n'),
        }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('checking').textContent).toBe('false'));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.getByTestId('candidate').textContent).toBe('');
    expect(screen.getByTestId('status').textContent).toBe('idle');
    await waitForStored((record) => {
      expect(record?.text).toContain('OLD');
    });
  });
});
