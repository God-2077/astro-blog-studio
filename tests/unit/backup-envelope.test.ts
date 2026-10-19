import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { isBackupEnvelope, openBackup, sealBackup } from '@/lib/backup/envelope';
import type { BackupRecord } from '@/lib/backup/model';
import { backupStorageKey } from '@/lib/backup/store';
import { deriveBackupKey } from '@/lib/vault/crypto';

const SLOT = backupStorageKey('live:God-2077/astro-blog-content@main', 'src/content/blog/note/便笺.md');

function makeRecord(): BackupRecord {
  const text = '---\ntitle: 私密标题\npassword: hunter2\n---\n\n正文内容\n';
  return {
    version: 1,
    repoKey: 'live:God-2077/astro-blog-content@main',
    path: 'src/content/blog/note/便笺.md',
    isNew: false,
    baseSha: 'sha-old',
    mode: 'form',
    savedAt: 1_700_000_000_000,
    size: text.length,
    text,
    state: {
      body: '正文内容\n',
      rawInner: 'title: 私密标题\npassword: hunter2',
      hasFrontmatter: true,
      fmError: null,
      form: { title: '私密标题' },
      sourceText: text,
    },
  };
}

function dataKey(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

describe('backup envelope', () => {
  it('round-trips only with the key derived from the same vault data key', async () => {
    const key = await deriveBackupKey(dataKey(7));
    const sameKey = await deriveBackupKey(dataKey(7));
    const otherKey = await deriveBackupKey(dataKey(8));
    const record = makeRecord();

    const envelope = await sealBackup(record, key, SLOT);
    expect(isBackupEnvelope(envelope)).toBe(true);
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain('私密标题');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('正文内容');

    await expect(openBackup(envelope, sameKey, SLOT)).resolves.toMatchObject({ text: record.text });
    await expect(openBackup(envelope, otherKey, SLOT)).resolves.toBeNull();
  });

  it('binds the ciphertext to its storage slot and readable metadata', async () => {
    const key = await deriveBackupKey(dataKey(7));
    const envelope = await sealBackup(makeRecord(), key, SLOT);

    await expect(openBackup(envelope, key, `${SLOT}:other`)).resolves.toBeNull();
    await expect(openBackup({ ...envelope, savedAt: envelope.savedAt + 1 }, key, SLOT)).resolves.toBeNull();
    await expect(openBackup({ ...envelope, size: envelope.size + 1 }, key, SLOT)).resolves.toBeNull();
  });

  it('rejects a truncated ciphertext instead of surfacing a partial record', async () => {
    const key = await deriveBackupKey(dataKey(7));
    const envelope = await sealBackup(makeRecord(), key, SLOT);
    const parsed = { ...envelope };
    // A truncated/corrupted ciphertext must never surface as a record.
    parsed.ciphertext = envelope.ciphertext.slice(0, -8);
    await expect(openBackup(parsed, key, SLOT)).resolves.toBeNull();
  });
});
