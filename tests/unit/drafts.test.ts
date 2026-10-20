import 'fake-indexeddb/auto';
import { createStore, get as idbGet, set as idbSet } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type BackupRecord, restoreToEditorState } from '@/lib/backup/model';
import { clearAllBackups, writeBackup } from '@/lib/backup/store';
import { mergeDraftBox } from '@/lib/drafts/box';
import { isDraftEnvelope } from '@/lib/drafts/envelope';
import {
  type DraftRecord,
  draftCharCount,
  draftFromBackup,
  draftFromText,
  draftToBackup,
  draftTitle,
  isDraftRecord,
  MAX_DRAFT_CHARS,
} from '@/lib/drafts/model';
import { capturePendingDraft } from '@/lib/drafts/pending';
import {
  clearAllDrafts,
  clearDraftsByPrefix,
  draftStorageKey,
  dropDraftMemory,
  listDrafts,
  readDraft,
  removeDraft,
  writeDraft,
} from '@/lib/drafts/store';
import { vaultSession } from '@/lib/vault/session';

const REPO_KEY = 'demo:God-2077/astro-blog-content@main';
const LIVE_KEY = 'live:God-2077/astro-blog-content@main';
const PATH = 'src/content/blog/note/便笺.md';
const TEXT = '---\ntitle: 原题\n---\n\n正文\n';
const rawStore = createStore('abs-drafts', 'drafts');
const fields = [{ name: 'title', type: 'string', required: true } as const];

function makeDraft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    version: 1,
    repoKey: REPO_KEY,
    path: PATH,
    title: '原题',
    isNew: false,
    baseSha: 'sha-old',
    mode: 'form',
    savedAt: 1_700_000_000_000,
    size: TEXT.length,
    text: TEXT,
    state: {
      body: '正文\n',
      rawInner: 'title: 原题',
      hasFrontmatter: true,
      fmError: null,
      form: { title: '原题' },
      sourceText: TEXT,
    },
    ...overrides,
  };
}

beforeEach(async () => {
  await clearAllDrafts();
  await clearAllBackups();
  vaultSession.set('test-token', new Uint8Array(32).fill(7));
});

afterEach(() => {
  vaultSession.clear();
});

describe('draft record model', () => {
  it('accepts a valid record and rejects shape/size/sha mismatches', () => {
    expect(isDraftRecord(makeDraft())).toBe(true);
    expect(isDraftRecord(makeDraft({ isNew: true, baseSha: '' }))).toBe(true);
    expect(isDraftRecord({ ...makeDraft(), title: 3 })).toBe(false);
    expect(isDraftRecord({ ...makeDraft(), size: 4 })).toBe(false);
    expect(isDraftRecord({ ...makeDraft(), baseSha: '' })).toBe(false);
    expect(isDraftRecord(null)).toBe(false);
  });

  it('derives a title from frontmatter, then the path, then 无标题', () => {
    expect(draftTitle('  标题  ', PATH)).toBe('标题');
    expect(draftTitle(undefined, 'src/a/便笺.md')).toBe('便笺');
    expect(draftTitle('', 'src/a/.md')).toBe('无标题');
  });

  it('snapshots a plain document with form values and source text', () => {
    const draft = draftFromText({
      repoKey: REPO_KEY,
      path: PATH,
      text: '\uFEFF---\r\ntitle: 新稿\r\n---\r\n\r\n正文\r\n',
      fields,
      isNew: true,
      baseSha: '',
      savedAt: 42,
    });
    expect(draft.title).toBe('新稿');
    expect(draft.mode).toBe('form');
    expect(draft.state.body).toBe('\n正文\n');
    expect(draft.state.form).toEqual({ title: '新稿' });
    expect(draft.state.sourceText).not.toContain('\r');
    expect(draft.state.sourceText.startsWith('\uFEFF')).toBe(false);
    expect(draft.size).toBe(draft.text.length);
  });

  it('promotes a backup without losing its restore state', () => {
    const text = '---\ntitle: 备份标题\n---\n\n备份正文\n';
    const backup: BackupRecord = {
      version: 1,
      repoKey: LIVE_KEY,
      path: PATH,
      isNew: true,
      baseSha: '',
      mode: 'source',
      savedAt: 99,
      size: text.length,
      text,
      state: {
        body: '备份正文\n',
        rawInner: 'title: 备份标题',
        hasFrontmatter: true,
        fmError: null,
        form: { title: '备份标题' },
        sourceText: text,
      },
    };
    const draft = draftFromBackup(backup);
    expect(draft.title).toBe('备份标题');
    expect(draft.mode).toBe('source');
    expect(draft.savedAt).toBe(99);
    expect(draft.baseSha).toBe('');
    expect(isDraftRecord(draft)).toBe(true);
    expect(restoreToEditorState(draftToBackup(draft), text).sourceText).toBe(text);
  });

  it('counts non-whitespace characters for the list', () => {
    expect(draftCharCount(' a b\n c ')).toBe(3);
  });
});

describe('draft box merge', () => {
  function makeBackup(overrides: Partial<BackupRecord> = {}): BackupRecord {
    return {
      version: 1,
      repoKey: REPO_KEY,
      path: PATH,
      isNew: false,
      baseSha: 'sha-old',
      mode: 'form',
      savedAt: 1_700_000_000_000,
      size: TEXT.length,
      text: TEXT,
      state: makeDraft().state,
      ...overrides,
    };
  }

  it('shows an autosave backup as a draft when there is no explicit draft', () => {
    const backup = makeBackup({ savedAt: 2, text: '---\ntitle: 备份稿\n---\n\n备份正文\n' });
    const items = mergeDraftBox(REPO_KEY, [], [backup]);
    expect(items).toHaveLength(1);
    expect(items[0]?.origin).toBe('backup');
    expect(items[0]?.title).toBe('备份稿');
    expect(items[0]?.savedAt).toBe(2);
  });

  it('keeps one row per path and lets the newer copy win', () => {
    const draft = makeDraft({ savedAt: 3, text: '---\ntitle: 显式草稿\n---\n\n显式正文\n' });
    const newerBackup = makeBackup({ savedAt: 4, text: '---\ntitle: 更新的备份\n---\n\n备份正文\n' });
    const items = mergeDraftBox(REPO_KEY, [draft], [newerBackup]);
    expect(items).toHaveLength(1);
    expect(items[0]?.origin).toBe('backup');
    expect(items[0]?.title).toBe('更新的备份');

    const newerDraft = makeDraft({
      savedAt: 5,
      title: '更新的草稿',
      text: '---\ntitle: 更新的草稿\n---\n\n草稿正文\n',
    });
    const olderBackup = makeBackup({ savedAt: 4 });
    const kept = mergeDraftBox(REPO_KEY, [newerDraft], [olderBackup]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.origin).toBe('draft');
    expect(kept[0]?.title).toBe('更新的草稿');
  });

  it('merges different paths, sorts newest first and ignores other repos', () => {
    const otherPath = 'src/content/blog/note/other.md';
    const items = mergeDraftBox(
      REPO_KEY,
      [makeDraft({ savedAt: 2 })],
      [
        makeBackup({ path: otherPath, savedAt: 6, text: '---\ntitle: 另一篇\n---\n\n另一篇正文\n' }),
        makeBackup({ repoKey: LIVE_KEY, path: 'src/content/blog/live.md', savedAt: 9 }),
      ],
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe('另一篇');
    expect(items[1]?.title).toBe('原题');
  });
});

describe('draft store', () => {
  it('round-trips, lists and removes drafts by repo', async () => {
    expect(await writeDraft(makeDraft())).toBe('saved');
    expect(await readDraft(REPO_KEY, PATH)).toMatchObject({ title: '原题', baseSha: 'sha-old' });

    await writeDraft(
      makeDraft({
        repoKey: LIVE_KEY,
        path: 'src/content/blog/other.md',
        savedAt: 2,
      }),
    );

    expect(await listDrafts(REPO_KEY)).toHaveLength(1);
    expect(await listDrafts('')).toHaveLength(2);
    expect(await listDrafts('live:God-2077/astro-blog-content@main')).toHaveLength(1);

    await removeDraft(REPO_KEY, PATH);
    expect(await readDraft(REPO_KEY, PATH)).toBeNull();
    expect(await listDrafts(REPO_KEY)).toHaveLength(0);
  });

  it('clears only the requested repo prefix', async () => {
    await writeDraft(makeDraft());
    await writeDraft(makeDraft({ repoKey: LIVE_KEY, path: 'src/content/blog/other.md' }));

    expect(await clearDraftsByPrefix('demo:')).toBe(true);
    expect(await readDraft(REPO_KEY, PATH)).toBeNull();
    expect(await readDraft(LIVE_KEY, 'src/content/blog/other.md')).not.toBeNull();
  });

  it('refuses oversized drafts before touching storage', async () => {
    const draft = makeDraft({ size: MAX_DRAFT_CHARS + 1 });
    expect(await writeDraft(draft)).toBe('too-large');
    expect(await readDraft(REPO_KEY, PATH)).toBeNull();
  });

  it('falls back to the in-tab copy when IndexedDB is unchanged', async () => {
    await writeDraft(makeDraft());
    expect(await readDraft(REPO_KEY, PATH)).toMatchObject({ text: TEXT });
  });
});

describe('encrypted live drafts', () => {
  it('stores only ciphertext and keeps titles/paths out of IndexedDB', async () => {
    const draft = makeDraft({ repoKey: LIVE_KEY, title: '秘密标题' });
    expect(await writeDraft(draft)).toBe('saved');

    const raw = await idbGet(draftStorageKey(LIVE_KEY, PATH), rawStore);
    const serialized = JSON.stringify(raw);
    expect(isDraftEnvelope(raw)).toBe(true);
    expect(serialized).not.toContain('原题');
    expect(serialized).not.toContain('秘密标题');
    expect(serialized).not.toContain('正文');
    expect(serialized).not.toContain('sha-old');

    dropDraftMemory();
    await expect(readDraft(LIVE_KEY, PATH)).resolves.toMatchObject({ title: '秘密标题', text: TEXT });
  });

  it('keeps demo drafts plaintext because there is no vault in demo mode', async () => {
    await writeDraft(makeDraft());
    const raw = await idbGet(draftStorageKey(REPO_KEY, PATH), rawStore);
    expect(isDraftRecord(raw)).toBe(true);
    expect((raw as DraftRecord).text).toBe(TEXT);
  });

  it('rejects a tampered envelope and a cross-slot copy', async () => {
    await writeDraft(makeDraft({ repoKey: LIVE_KEY }));
    const slot = draftStorageKey(LIVE_KEY, PATH);
    const envelope = await idbGet(slot, rawStore);

    await idbSet(slot, { ...(envelope as object), ciphertext: 'AAAA' }, rawStore);
    dropDraftMemory();
    expect(await readDraft(LIVE_KEY, PATH)).toBeNull();

    await idbSet(slot, envelope, rawStore);
    const otherPath = 'src/content/blog/other.md';
    await idbSet(draftStorageKey(LIVE_KEY, otherPath), envelope, rawStore);
    dropDraftMemory();
    expect(await readDraft(LIVE_KEY, otherPath)).toBeNull();
  });

  it('refuses to write plaintext when the vault is locked', async () => {
    vaultSession.clear();
    dropDraftMemory();
    expect(await writeDraft(makeDraft({ repoKey: LIVE_KEY }))).toBe('locked');
    expect(await idbGet(draftStorageKey(LIVE_KEY, PATH), rawStore)).toBeUndefined();
    expect(await readDraft(LIVE_KEY, PATH)).toBeNull();
  });

  it('lists only readable drafts while locked', async () => {
    await writeDraft(makeDraft());
    await writeDraft(makeDraft({ repoKey: LIVE_KEY, path: 'src/content/blog/other.md' }));

    vaultSession.clear();
    dropDraftMemory();
    const visible = await listDrafts('');
    expect(visible).toHaveLength(1);
    expect(visible[0]?.repoKey).toBe(REPO_KEY);
  });
});

describe('capturePendingDraft', () => {
  it('prefers the newer editor backup over the initial memory document', async () => {
    const backupText = '---\ntitle: 最新标题\n---\n\n最新正文\n';
    const backup: BackupRecord = {
      version: 1,
      repoKey: REPO_KEY,
      path: PATH,
      isNew: true,
      baseSha: '',
      mode: 'form',
      savedAt: 5,
      size: backupText.length,
      text: backupText,
      state: {
        body: '最新正文\n',
        rawInner: 'title: 最新标题',
        hasFrontmatter: true,
        fmError: null,
        form: { title: '最新标题' },
        sourceText: backupText,
      },
    };
    await writeBackup(backup);

    const draft = await capturePendingDraft({
      repoKey: REPO_KEY,
      fields,
      pending: { path: PATH, text: '---\ntitle: 初稿\n---\n\n初稿正文\n' },
    });
    expect(draft.text).toBe(backupText);
    expect(draft.title).toBe('最新标题');
    expect(draft.isNew).toBe(true);
    expect(draft.baseSha).toBe('');
  });

  it('keeps an explicit draft when autosave is unavailable', async () => {
    const savedText = '---\ntitle: 已存草稿\n---\n\n已存正文\n';
    const saved = makeDraft({
      isNew: true,
      baseSha: '',
      title: '已存草稿',
      text: savedText,
      size: savedText.length,
      state: {
        ...makeDraft().state,
        body: '已存正文\n',
        rawInner: 'title: 已存草稿',
        form: { title: '已存草稿' },
        sourceText: savedText,
      },
    });
    await writeDraft(saved);

    const draft = await capturePendingDraft({
      repoKey: REPO_KEY,
      fields,
      pending: { path: PATH, text: '---\ntitle: 初始\n---\n\n初始正文\n' },
    });
    expect(draft.text).toBe(savedText);
    expect(draft.title).toBe('已存草稿');
  });

  it('falls back to the pending text when no backup exists', async () => {
    const text = '---\ntitle: 初稿\n---\n\n初稿正文\n';
    const draft = await capturePendingDraft({
      repoKey: REPO_KEY,
      fields,
      pending: { path: PATH, text },
    });
    expect(draft.text).toBe(text);
    expect(draft.title).toBe('初稿');
    expect(draft.state.form).toEqual({ title: '初稿' });
  });
});
