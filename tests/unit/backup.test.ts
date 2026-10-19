import 'fake-indexeddb/auto';
import { createStore, get as idbGet, set as idbSet } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type BackupEnvelope, isBackupEnvelope } from '@/lib/backup/envelope';
import {
  type BackupRecord,
  backupCharCount,
  backupKeyPrefix,
  backupRemoteChanged,
  backupRepoKey,
  buildBackupText,
  isBackupRecord,
  MAX_BACKUP_CHARS,
  restoreToEditorState,
} from '@/lib/backup/model';
import {
  backupStorageKey,
  clearAllBackups,
  clearBackupsByPrefix,
  dropBackupMemory,
  listBackups,
  migrateBackups,
  readBackup,
  removeBackup,
  writeBackup,
} from '@/lib/backup/store';
import { parseDocument } from '@/lib/markdown/document';
import { vaultSession } from '@/lib/vault/session';

const REPO_KEY = 'demo:God-2077/astro-blog-content@main';
const PREFIX = 'demo:God-2077/astro-blog-content@';
const PATH = 'src/content/blog/note/便笺.md';
const LIVE_KEY = 'live:God-2077/astro-blog-content@main';
const rawStore = createStore('abs-backups', 'backups');

function makeRecord(overrides: Partial<BackupRecord> = {}): BackupRecord {
  const text = '---\ntitle: 原题\n---\n\n正文\n';
  return {
    version: 1,
    repoKey: REPO_KEY,
    path: PATH,
    isNew: false,
    baseSha: 'sha-old',
    mode: 'form',
    savedAt: 1_700_000_000_000,
    size: text.length,
    text,
    state: {
      body: '正文\n',
      rawInner: 'title: 原题',
      hasFrontmatter: true,
      fmError: null,
      form: { title: '原题' },
      sourceText: text,
    },
    ...overrides,
  };
}

beforeEach(async () => {
  await clearAllBackups();
  vaultSession.set('test-token', new Uint8Array(32).fill(7));
});

afterEach(() => {
  vaultSession.clear();
});

describe('backup record validation', () => {
  it('accepts a round-tripped existing-file record', () => {
    expect(isBackupRecord(makeRecord())).toBe(true);
    expect(isBackupRecord(makeRecord({ isNew: true, baseSha: '' }))).toBe(true);
  });

  it('rejects version, size, sha and shape mismatches', () => {
    expect(isBackupRecord({ ...makeRecord(), version: 2 })).toBe(false);
    expect(isBackupRecord({ ...makeRecord(), size: 3 })).toBe(false);
    expect(isBackupRecord({ ...makeRecord(), baseSha: '' })).toBe(false);
    expect(isBackupRecord(makeRecord({ isNew: true, baseSha: 'sha-old' }))).toBe(false);
    expect(isBackupRecord({ ...makeRecord(), state: null })).toBe(false);
    expect(isBackupRecord({ ...makeRecord(), mode: 'text' })).toBe(false);
    expect(isBackupRecord(null)).toBe(false);
  });

  it('drops records whose form carries prototype keys', () => {
    const poisoned = JSON.parse(JSON.stringify(makeRecord())) as BackupRecord;
    Object.defineProperty(poisoned.state.form, '__proto__', { value: 'x', enumerable: true });
    expect(isBackupRecord(poisoned)).toBe(false);
  });

  it('reports repo keys and remote changes without mixing branches', () => {
    const repo = { owner: 'God-2077', name: 'astro-blog-content', defaultBranch: 'main' };
    expect(backupRepoKey('demo', repo)).toBe(REPO_KEY);
    expect(backupKeyPrefix('live', repo)).toBe('live:God-2077/astro-blog-content@');
    const record = makeRecord();
    expect(backupRemoteChanged(record, 'sha-old')).toBe(false);
    expect(backupRemoteChanged(record, 'sha-new')).toBe(true);
    expect(backupRemoteChanged(record, null)).toBe(false);
    expect(backupRemoteChanged(makeRecord({ isNew: true, baseSha: '' }), 'sha-new')).toBe(false);
  });
});

describe('buildBackupText', () => {
  const fields = [{ name: 'title', type: 'string', required: true } as const];

  function source(text: string) {
    const parsed = parseDocument(text);
    return {
      mode: 'form' as const,
      sourceText: text,
      meta: parsed.meta,
      rawInner: parsed.frontmatterRaw,
      body: parsed.body,
      hasFrontmatter: parsed.hasFrontmatter,
      fields,
      form: { title: '新题' },
      originalData: parsed.data,
    };
  }

  it('includes form edits without auto-updating updated', () => {
    const text = buildBackupText({
      ...source('---\ntitle: 原题\nupdated: 2024-01-01\n---\n\n正文\n'),
      form: { title: '新题', updated: '2024-01-01' },
    });
    expect(text).toContain('title: 新题');
    expect(text).toContain('updated: 2024-01-01');
    expect(text).toContain('正文');
  });

  it('keeps the body when a required field is invalid instead of throwing', () => {
    const input = source('---\ntitle: 原题\n---\n\n正文\n');
    let text = '';
    expect(() => {
      text = buildBackupText({ ...input, form: { title: '' } });
    }).not.toThrow();
    expect(text).toContain('正文');
    expect(text).toContain('title: 原题');
  });

  it('normalizes CRLF/BOM in both modes', () => {
    const crlf = '\uFEFF---\r\ntitle: 原题\r\n---\r\n\r\n正文\r\n';
    const built = buildBackupText(source(crlf));
    expect(built).not.toContain('\r');
    expect(built.startsWith('\uFEFF')).toBe(false);

    const parsed = parseDocument('---\ntitle: A\n---\n\nbody\n');
    const sourceMode = buildBackupText({
      mode: 'source',
      sourceText: '\uFEFF---\r\ntitle: A\r\n---\r\n\r\nbody\r\n',
      meta: parsed.meta,
      rawInner: '',
      body: '',
      hasFrontmatter: false,
      fields,
      form: {},
      originalData: {},
    });
    expect(sourceMode).toBe('---\ntitle: A\n---\n\nbody\n');
  });
});

describe('restoreToEditorState', () => {
  it('uses the current remote as diff baseline but keeps the backup base sha', () => {
    const backup = makeRecord({ baseSha: 'sha-from-backup' });
    const restored = restoreToEditorState(backup, '---\ntitle: 远端新题\n---\n\n远端正文\n');
    expect(restored.mode).toBe('form');
    expect(restored.form).toEqual({ title: '原题' });
    expect(restored.body).toBe('正文\n');
    expect(restored.originalData.title).toBe('远端新题');
    expect(restored.loadedSha).toBe('sha-from-backup');
    expect(restored.form).not.toBe(backup.state.form);
  });

  it('restores source mode and its exact buffer', () => {
    const backup = makeRecord({
      mode: 'source',
      state: {
        ...makeRecord().state,
        sourceText: '---\ntitle: 源文件\n---\n\n源正文\n',
      },
    });
    const restored = restoreToEditorState(backup, '---\ntitle: remote\n---\n');
    expect(restored.mode).toBe('source');
    expect(restored.sourceText).toBe('---\ntitle: 源文件\n---\n\n源正文\n');
    expect(restored.form).toEqual(backup.state.form);
  });

  it('counts non-whitespace characters for the dialog', () => {
    expect(backupCharCount(' a b\n c ')).toBe(3);
  });
});

describe('IndexedDB backup store', () => {
  it('round-trips, removes and validates the requested key', async () => {
    const record = makeRecord();
    expect(await writeBackup(record)).toBe('saved');
    expect(await readBackup(REPO_KEY, PATH)).toMatchObject({ path: PATH, baseSha: 'sha-old' });

    expect(await readBackup(REPO_KEY, 'src/content/blog/note/other.md')).toBeNull();
    expect(await readBackup('live:God-2077/astro-blog-content@main', PATH)).toBeNull();

    await removeBackup(REPO_KEY, PATH);
    expect(await readBackup(REPO_KEY, PATH)).toBeNull();
  });

  it('isolates repos and clears by repo prefix', async () => {
    const other = makeRecord({
      repoKey: 'live:God-2077/astro-blog-content@main',
      path: 'src/content/blog/other.md',
    });
    await writeBackup(makeRecord());
    await writeBackup(other);

    expect(await listBackups(PREFIX)).toHaveLength(1);
    expect(await listBackups('')).toHaveLength(2);

    expect(await clearBackupsByPrefix(PREFIX)).toBe(true);
    expect(await readBackup(REPO_KEY, PATH)).toBeNull();
    expect(await readBackup(other.repoKey, other.path)).not.toBeNull();
  });

  it('keeps the newest twenty records and drops the oldest', async () => {
    for (let index = 0; index < 21; index += 1) {
      const text = `---\ntitle: ${index}\n---\n\nbody\n`;
      await writeBackup(
        makeRecord({
          path: `src/content/blog/note/${index}.md`,
          savedAt: index + 1,
          size: text.length,
          text,
        }),
      );
    }

    const records = await listBackups('');
    expect(records).toHaveLength(20);
    expect(records.some((record) => record.savedAt === 1)).toBe(false);
    expect(records.some((record) => record.savedAt === 21)).toBe(true);
  });

  it('refuses oversized records before touching storage', async () => {
    const record = makeRecord({ size: MAX_BACKUP_CHARS + 1 });
    expect(await writeBackup(record)).toBe('too-large');
    expect(await readBackup(REPO_KEY, PATH)).toBeNull();
  });
});

describe('encrypted live backups', () => {
  it('stores only a ciphertext envelope and hides the draft from IndexedDB', async () => {
    const record = makeRecord({ repoKey: LIVE_KEY });
    expect(await writeBackup(record)).toBe('saved');

    const raw = await idbGet(backupStorageKey(LIVE_KEY, PATH), rawStore);
    const serialized = JSON.stringify(raw);
    expect(isBackupEnvelope(raw)).toBe(true);
    expect(serialized).not.toContain('原题');
    expect(serialized).not.toContain('正文');
    expect(serialized).not.toContain('sha-old');

    await expect(readBackup(LIVE_KEY, PATH)).resolves.toMatchObject({ text: record.text, baseSha: 'sha-old' });
  });

  it('keeps demo backups plaintext because there is no vault in demo mode', async () => {
    await writeBackup(makeRecord());
    const raw = await idbGet(backupStorageKey(REPO_KEY, PATH), rawStore);
    expect(isBackupRecord(raw)).toBe(true);
    expect((raw as BackupRecord).text).toContain('原题');
  });

  it('rejects a tampered envelope and a cross-slot copy', async () => {
    await writeBackup(makeRecord({ repoKey: LIVE_KEY }));
    const slot = backupStorageKey(LIVE_KEY, PATH);
    const envelope = (await idbGet(slot, rawStore)) as BackupEnvelope;

    await idbSet(slot, { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA` }, rawStore);
    dropBackupMemory();
    expect(await readBackup(LIVE_KEY, PATH)).toBeNull();

    await idbSet(slot, envelope, rawStore);
    const otherPath = 'src/content/blog/note/other.md';
    await idbSet(backupStorageKey(LIVE_KEY, otherPath), envelope, rawStore);
    dropBackupMemory();
    expect(await readBackup(LIVE_KEY, otherPath)).toBeNull();
  });

  it('refuses to write plaintext when the vault is locked', async () => {
    vaultSession.clear();
    dropBackupMemory();
    const record = makeRecord({ repoKey: LIVE_KEY });
    expect(await writeBackup(record)).toBe('locked');
    expect(await idbGet(backupStorageKey(LIVE_KEY, PATH), rawStore)).toBeUndefined();
    expect(await readBackup(LIVE_KEY, PATH)).toBeNull();
  });

  it('lists only readable records when the vault locks', async () => {
    await writeBackup(makeRecord({ repoKey: LIVE_KEY }));
    await writeBackup(makeRecord());
    expect(await listBackups('')).toHaveLength(2);

    vaultSession.clear();
    dropBackupMemory();
    const locked = await listBackups('');
    expect(locked).toHaveLength(1);
    expect(locked[0]?.repoKey).toBe(REPO_KEY);
  });

  it('keeps the newest twenty encrypted records', async () => {
    for (let index = 0; index < 21; index += 1) {
      const text = `---\ntitle: ${index}\n---\n\nbody\n`;
      await writeBackup(
        makeRecord({
          repoKey: LIVE_KEY,
          path: `src/content/blog/note/${index}.md`,
          savedAt: index + 1,
          size: text.length,
          text,
        }),
      );
    }

    const records = await listBackups('live:');
    expect(records).toHaveLength(20);
    expect(records.some((record) => record.savedAt === 1)).toBe(false);
    expect(records.some((record) => record.savedAt === 21)).toBe(true);
  });

  it('re-encrypts plaintext records left by older versions', async () => {
    const slot = backupStorageKey(LIVE_KEY, PATH);
    const legacy = makeRecord({ repoKey: LIVE_KEY });
    await idbSet(slot, legacy, rawStore);
    expect(await readBackup(LIVE_KEY, PATH)).toMatchObject({ baseSha: 'sha-old' });

    await migrateBackups();
    const raw = await idbGet(slot, rawStore);
    expect(isBackupEnvelope(raw)).toBe(true);
    expect(JSON.stringify(raw)).not.toContain('原题');

    dropBackupMemory();
    await expect(readBackup(LIVE_KEY, PATH)).resolves.toMatchObject({ text: legacy.text });
  });
});
