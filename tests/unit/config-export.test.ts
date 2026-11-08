import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/lib/config/defaults';
import {
  buildConfigExport,
  CONFIG_EXPORT_FORMAT,
  CONFIG_EXPORT_VERSION,
  collectExportTokens,
  configExportFilename,
  requiresExportPassword,
} from '@/lib/config/export';
import type { RepoConfig, RepoProfile, Settings } from '@/lib/config/schema';

const activeRepo: RepoConfig = { owner: 'acme', name: 'active', branch: 'main' };

function profile(owner: string, name: string, branch = 'main'): RepoProfile {
  return {
    owner,
    name,
    branch,
    content: structuredClone(defaultSettings.content),
    commit: structuredClone(defaultSettings.commit),
    frontmatter: structuredClone(defaultSettings.frontmatter),
  };
}

describe('collectExportTokens', () => {
  it('uses one stored token per repository and reports missing PATs', () => {
    const profiles = [profile('acme', 'active'), profile('acme', 'notes')];
    const result = collectExportTokens(
      profiles,
      activeRepo,
      { 'acme/active': ' pat-active ', 'acme/notes': 'pat-notes' },
      null,
    );

    expect(result).toEqual({
      tokens: { 'acme/active': 'pat-active', 'acme/notes': 'pat-notes' },
      missing: [],
    });
  });

  it('falls back to the legacy token only for the active repository', () => {
    const profiles = [profile('acme', 'active'), profile('acme', 'notes')];
    const result = collectExportTokens(profiles, activeRepo, {}, 'legacy-token');

    expect(result.tokens).toEqual({ 'acme/active': 'legacy-token' });
    expect(result.missing).toEqual(['acme/notes']);
  });

  it('treats blank stored values as missing and keeps profile order', () => {
    const profiles = [profile('acme', 'active'), profile('zeta', 'notes'), profile('beta', 'blog')];
    const result = collectExportTokens(profiles, activeRepo, { 'zeta/notes': '   ' }, null);

    expect(result.tokens).toEqual({});
    expect(result.missing).toEqual(['acme/active', 'zeta/notes', 'beta/blog']);
  });

  it('deduplicates a repository used by several branches', () => {
    const profiles = [profile('acme', 'active', 'main'), profile('acme', 'active', 'preview'), profile('acme', 'notes')];
    const result = collectExportTokens(profiles, activeRepo, { 'acme/active': 'pat-active' }, 'legacy-token');

    expect(result.tokens).toEqual({ 'acme/active': 'pat-active' });
    expect(result.missing).toEqual(['acme/notes']);
  });

  it('does not read inherited object properties as PATs', () => {
    const profiles = [profile('toString', 'repo')];
    const result = collectExportTokens(profiles, null, {}, null);

    expect(result.tokens).toEqual({});
    expect(result.missing).toEqual(['toString/repo']);
  });
});

describe('buildConfigExport', () => {
  it('builds a self-describing document from normalized saved settings', () => {
    const now = new Date('2026-03-04T05:06:07.000Z');
    const settings = {
      ...defaultSettings,
      unknownAction: () => undefined,
      content: { ...defaultSettings.content, rootDir: 'src/content' },
    } as unknown as Settings;

    const document = buildConfigExport({ settings, tokens: { 'z/repo': 'z', 'a/repo': 'a' }, source: 'live', now });

    expect(document.format).toBe(CONFIG_EXPORT_FORMAT);
    expect(document.version).toBe(CONFIG_EXPORT_VERSION);
    expect(document.exportedAt).toBe(now.toISOString());
    expect(document.source).toBe('live');
    expect(document.app.name).toBeTruthy();
    expect(document.app.version).toBeTruthy();
    expect(document.settings.content.rootDir).toBe('src/content');
    expect('unknownAction' in document.settings).toBe(false);
    expect(Object.keys(document.tokens)).toEqual(['a/repo', 'z/repo']);
    expect(JSON.parse(JSON.stringify(document))).toMatchObject({ source: 'live', tokens: { 'a/repo': 'a' } });
  });

  it('keeps demo exports free of tokens and never mutates the input settings', () => {
    const settings = structuredClone(defaultSettings);
    const snapshot = structuredClone(settings);

    const document = buildConfigExport({ settings, tokens: {}, source: 'demo' });

    expect(document.source).toBe('demo');
    expect(document.tokens).toEqual({});
    expect(settings).toEqual(snapshot);
  });
});

describe('export password policy', () => {
  it('asks for a password only for the plain password mode', () => {
    expect(requiresExportPassword('password')).toBe(true);
    expect(requiresExportPassword('device')).toBe(false);
    expect(requiresExportPassword('two-factor')).toBe(false);
    expect(requiresExportPassword('legacy-mixed')).toBe(false);
    expect(requiresExportPassword(null)).toBe(false);
  });
});

describe('configExportFilename', () => {
  it('uses a UTC timestamp with a stable shape', () => {
    expect(configExportFilename(new Date('2026-03-04T05:06:07.890Z'))).toBe('astro-blog-studio-config-20260304-050607.json');
  });
});
