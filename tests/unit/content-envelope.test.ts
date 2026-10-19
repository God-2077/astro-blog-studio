import { describe, expect, it } from 'vitest';
import { contentFileAad, contentMetaAad, openContent, sealContent } from '@/lib/content/envelope';
import type { ContentFile, ContentMeta } from '@/lib/content/model';
import { isContentFile, isContentMeta } from '@/lib/content/model';
import { importAesKey, randomBytes } from '@/lib/vault/crypto';

const repoKey = 'live:God-2077/astro-blog-content-test@main';

function meta(): ContentMeta {
  return {
    version: 1,
    repoKey,
    signature: 'src\u0000.md,.mdx\u0000',
    treeSha: 'tree-sha',
    savedAt: 1_700_000_000_000,
    files: [{ path: 'src/content/blog/post/hello-world.md', sha: 'blob-a', chars: 42 }],
  };
}

function file(): ContentFile {
  const text = "---\ntitle: '秘密标题'\n---\n正文";
  return { path: 'src/content/blog/post/hello-world.md', sha: 'blob-a', text, size: text.length };
}

describe('content envelope', () => {
  it('round-trips the encrypted meta record', async () => {
    const key = await importAesKey(randomBytes(32));
    const value = meta();
    const envelope = await sealContent(value, key, contentMetaAad(repoKey), value.savedAt);

    expect(envelope.ciphertext).not.toContain('tree-sha');
    expect(envelope.size).toBeGreaterThan(0);

    const opened = await openContent(envelope, key, contentMetaAad(repoKey), isContentMeta);
    expect(opened).toEqual(value);
  });

  it('round-trips an article record bound to repo, path and blob sha', async () => {
    const key = await importAesKey(randomBytes(32));
    const value = file();
    const envelope = await sealContent(value, key, contentFileAad(repoKey, value.path, value.sha), Date.now());

    await expect(openContent(envelope, key, contentFileAad(repoKey, value.path, value.sha), isContentFile)).resolves.toEqual(
      value,
    );
    // A record copied to another path or sha cannot be opened.
    await expect(openContent(envelope, key, contentFileAad(repoKey, 'other.md', value.sha), isContentFile)).resolves.toBeNull();
    await expect(openContent(envelope, key, contentFileAad(repoKey, value.path, 'blob-b'), isContentFile)).resolves.toBeNull();
    await expect(
      openContent(envelope, key, contentFileAad('live:o/r@dev', value.path, value.sha), isContentFile),
    ).resolves.toBeNull();
  });

  it('rejects a wrong key and a tampered ciphertext', async () => {
    const key = await importAesKey(randomBytes(32));
    const other = await importAesKey(randomBytes(32));
    const value = file();
    const aad = contentFileAad(repoKey, value.path, value.sha);
    const envelope = await sealContent(value, key, aad, Date.now());

    await expect(openContent(envelope, other, aad, isContentFile)).resolves.toBeNull();

    const tampered = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA` };
    await expect(openContent(tampered, key, aad, isContentFile)).resolves.toBeNull();
  });

  it('rejects a size mismatch and a validator failure', async () => {
    const key = await importAesKey(randomBytes(32));
    const aad = contentMetaAad(repoKey);
    const envelope = await sealContent(meta(), key, aad, Date.now());

    await expect(openContent({ ...envelope, size: envelope.size + 1 }, key, aad, isContentMeta)).resolves.toBeNull();

    const notMeta: unknown = { version: 1, files: 'nope' };
    const wrongShape = await sealContent(notMeta, key, aad, Date.now());
    await expect(openContent(wrongShape, key, aad, isContentMeta)).resolves.toBeNull();
  });
});
