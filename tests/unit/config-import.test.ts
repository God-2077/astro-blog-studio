import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/lib/config/defaults';
import { buildConfigExport, CONFIG_EXPORT_FORMAT, CONFIG_EXPORT_VERSION } from '@/lib/config/export';
import { ConfigImportError, parseConfigImport } from '@/lib/config/import';
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

function settingsWith(repo: RepoConfig | null, repos: RepoProfile[]): Settings {
  return {
    ...structuredClone(defaultSettings),
    repo,
    repos,
    content: { ...structuredClone(defaultSettings.content), rootDir: 'content' },
    commit: { ...structuredClone(defaultSettings.commit), create: 'imported: {title}' },
  };
}

function documentOf(settings: Settings, tokens: Record<string, string>): string {
  return JSON.stringify(buildConfigExport({ settings, tokens, source: 'live', now: new Date('2026-03-04T05:06:07.000Z') }));
}

function codeOf(text: string): string {
  try {
    parseConfigImport(text);
  } catch (caught) {
    return caught instanceof ConfigImportError ? caught.code : 'UNKNOWN';
  }
  return 'OK';
}

describe('parseConfigImport', () => {
  it('round-trips a live export with active and inactive repositories', () => {
    const settings = settingsWith(activeRepo, [profile('acme', 'notes')]);
    const parsed = parseConfigImport(documentOf(settings, { 'acme/active': ' pat-active ', 'acme/notes': 'pat-notes' }));

    expect(parsed.source).toBe('live');
    expect(parsed.exportedAt).toBe('2026-03-04T05:06:07.000Z');
    expect(parsed.repoCount).toBe(2);
    expect(parsed.tokenCount).toBe(2);
    expect(parsed.tokens).toEqual({ 'acme/active': 'pat-active', 'acme/notes': 'pat-notes' });
    expect(parsed.settings.repo).toEqual(activeRepo);
    expect(parsed.settings.repos).toHaveLength(1);
    expect(parsed.settings.content.rootDir).toBe('content');
    expect(parsed.settings.commit.create).toBe('imported: {title}');
  });

  it('normalizes token keys and ignores tokens for repositories outside the file', () => {
    const settings = settingsWith(activeRepo, [profile('acme', 'notes')]);
    const parsed = parseConfigImport(
      documentOf(settings, {
        ' ACME/ACTIVE ': ' pat-active ',
        'Acme/Notes': 'pat-notes',
        'other/repo': 'unused',
      }),
    );

    expect(parsed.tokens).toEqual({ 'acme/active': 'pat-active', 'acme/notes': 'pat-notes' });
    expect(parsed.tokenCount).toBe(2);
  });

  it('requires only one PAT when the same repository is used by several branches', () => {
    const settings = settingsWith(activeRepo, [profile('acme', 'active', 'preview')]);
    const parsed = parseConfigImport(documentOf(settings, { 'acme/active': 'pat-active' }));

    expect(parsed.repoCount).toBe(2);
    expect(parsed.tokenCount).toBe(1);
  });

  it('reports every profile missing a PAT in file order', () => {
    const settings = settingsWith(activeRepo, [profile('zeta', 'notes'), profile('beta', 'blog')]);
    let caught: ConfigImportError | null = null;
    try {
      parseConfigImport(documentOf(settings, {}));
    } catch (error) {
      caught = error instanceof ConfigImportError ? error : null;
    }

    expect(caught?.code).toBe('MISSING_PAT');
    expect(caught?.missing).toEqual(['acme/active', 'zeta/notes', 'beta/blog']);
  });

  it('rejects invalid JSON and unsupported document shapes', () => {
    expect(codeOf('{')).toBe('INVALID_JSON');
    expect(codeOf('[]')).toBe('INVALID_FORMAT');
    expect(codeOf('{}')).toBe('INVALID_FORMAT');
    expect(codeOf(JSON.stringify({ format: 'other', version: 1 }))).toBe('INVALID_FORMAT');
    expect(
      codeOf(
        JSON.stringify({
          format: CONFIG_EXPORT_FORMAT,
          version: CONFIG_EXPORT_VERSION,
          source: 'live',
          settings: defaultSettings,
          tokens: {},
        }),
      ),
    ).toBe('NO_ACTIVE_REPO');
    expect(
      codeOf(
        JSON.stringify({
          format: CONFIG_EXPORT_FORMAT,
          version: 99,
          source: 'live',
          settings: defaultSettings,
          tokens: {},
        }),
      ),
    ).toBe('INVALID_VERSION');
    expect(
      codeOf(
        JSON.stringify({
          format: CONFIG_EXPORT_FORMAT,
          version: CONFIG_EXPORT_VERSION,
          source: 'demo',
          settings: defaultSettings,
          tokens: {},
        }),
      ),
    ).toBe('DEMO_SOURCE');
    expect(
      codeOf(
        JSON.stringify({
          format: CONFIG_EXPORT_FORMAT,
          version: CONFIG_EXPORT_VERSION,
          source: 'live',
          settings: { repo: activeRepo },
          tokens: {},
        }),
      ),
    ).toBe('INVALID_SETTINGS');
  });

  it('rejects duplicate repository profiles', () => {
    const settings = settingsWith(activeRepo, [profile('acme', 'notes')]);
    const document = JSON.parse(documentOf(settings, { 'acme/active': 'pat', 'acme/notes': 'pat' })) as {
      settings: Settings;
    };
    document.settings.repos.push(profile('acme', 'active'));

    expect(codeOf(JSON.stringify(document))).toBe('DUPLICATE_REPO');
  });

  it('rejects malformed token maps', () => {
    const settings = settingsWith(activeRepo, []);
    const base = JSON.parse(documentOf(settings, { 'acme/active': 'pat' })) as Record<string, unknown>;

    for (const tokens of [
      null,
      [],
      { 'acme/active': 1 },
      { 'acme/active': '   ' },
      { 'not-a-token-key': 'pat' },
      { 'acme/active': 'one', 'ACME/ACTIVE': 'two' },
      Object.fromEntries([['__proto__', 'pat']]),
    ]) {
      expect(codeOf(JSON.stringify({ ...base, tokens }))).toBe('INVALID_TOKENS');
    }
  });

  it('rejects a live document without an active repository', () => {
    const settings = settingsWith(null, [profile('acme', 'notes')]);
    expect(codeOf(documentOf(settings, { 'acme/notes': 'pat' }))).toBe('NO_ACTIVE_REPO');
  });
});
