import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const bumpScript = join(repoRoot, 'scripts', 'bump-version.mjs');
const installScript = join(repoRoot, 'scripts', 'install-git-hooks.mjs');
const hookFile = join(repoRoot, '.githooks', 'pre-commit');
const DISABLE_HOOKS = ['-c', 'core.hooksPath=.git/no-hooks'];

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): string {
  return execFileSync('git', [...DISABLE_HOOKS, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** 不覆盖 core.hooksPath，让真实 pre-commit 钩子执行。 */
function gitWithHooks(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

interface ScriptResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runScript(cwd: string, script: string, args: string[] = [], env: Record<string, string> = {}): ScriptResult {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const PACKAGE_JSON = `{
  "name": "fixture",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "demo": "echo demo"
  }
}
`;

interface RepoOptions {
  withHook?: boolean;
}

function createRepo(version = '1.0.0', options: RepoOptions = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'abs-version-'));
  tempDirs.push(dir);
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Version Test']);
  writeFileSync(join(dir, 'package.json'), PACKAGE_JSON.replace('1.0.0', version), 'utf8');

  if (options.withHook) {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    copyFileSync(bumpScript, join(dir, 'scripts', 'bump-version.mjs'));
    mkdirSync(join(dir, '.githooks'), { recursive: true });
    copyFileSync(hookFile, join(dir, '.githooks', 'pre-commit'));
    chmodSync(join(dir, '.githooks', 'pre-commit'), 0o755);
    git(dir, ['config', 'core.hooksPath', '.githooks']);
  }

  git(dir, ['add', '--', 'package.json']);
  if (options.withHook) git(dir, ['add', '--', 'scripts', '.githooks']);
  git(dir, ['commit', '-q', '-m', 'init']);
  return dir;
}

function readVersion(dir: string): string {
  const parsed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version?: string };
  return parsed.version ?? '';
}

describe('version bump scripts', () => {
  it.skipIf(!hasGit)('stages the next patch version without touching the rest of the file', () => {
    const dir = createRepo('1.0.0');
    const before = readFileSync(join(dir, 'package.json'), 'utf8');

    const result = runScript(dir, bumpScript, ['--stage']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('1.0.0 → 1.0.1');
    expect(readVersion(dir)).toBe('1.0.1');
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(before.replace('"version": "1.0.0"', '"version": "1.0.1"'));
    expect(git(dir, ['show', ':package.json'])).toContain('"version": "1.0.1"');
  });

  it.skipIf(!hasGit)('skips when the staged version already differs from HEAD', () => {
    const dir = createRepo('1.0.0');
    const bumped = readFileSync(join(dir, 'package.json'), 'utf8').replace('"version": "1.0.0"', '"version": "2.0.0"');
    writeFileSync(join(dir, 'package.json'), bumped, 'utf8');
    git(dir, ['add', '--', 'package.json']);

    const result = runScript(dir, bumpScript, ['--stage']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('手工升版');
    expect(readVersion(dir)).toBe('2.0.0');
  });

  it.skipIf(!hasGit)('honors SKIP_VERSION_BUMP', () => {
    const dir = createRepo('1.0.0');

    const result = runScript(dir, bumpScript, ['--stage'], { SKIP_VERSION_BUMP: '1' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SKIP_VERSION_BUMP');
    expect(readVersion(dir)).toBe('1.0.0');
    expect(git(dir, ['show', ':package.json'])).toContain('"version": "1.0.0"');
  });

  it.skipIf(!hasGit)('skips while a merge is in progress', () => {
    const dir = createRepo('1.0.0');
    writeFileSync(join(dir, '.git', 'MERGE_HEAD'), `${git(dir, ['rev-parse', 'HEAD'])}\n`, 'utf8');

    const result = runScript(dir, bumpScript, ['--stage']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('MERGE');
    expect(readVersion(dir)).toBe('1.0.0');
  });

  it.skipIf(!hasGit)('supports minor and major bumps', () => {
    const dir = createRepo('1.2.3');

    expect(runScript(dir, bumpScript, ['minor']).status).toBe(0);
    expect(readVersion(dir)).toBe('1.3.0');
    expect(runScript(dir, bumpScript, ['major']).status).toBe(0);
    expect(readVersion(dir)).toBe('2.0.0');

    const content = readFileSync(join(dir, 'package.json'), 'utf8');
    expect(content.endsWith('\n')).toBe(true);
    expect(content).toContain('"name": "fixture"');
    expect(content).toContain('"demo": "echo demo"');
  });

  it.skipIf(!hasGit)('rejects a non x.y.z version in manual mode', () => {
    const dir = createRepo('1.2.3-beta.1');

    const result = runScript(dir, bumpScript);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('不是严格的 x.y.z');
    expect(readVersion(dir)).toBe('1.2.3-beta.1');
  });

  it.skipIf(!hasGit)('bumps the version inside a real commit', () => {
    const dir = createRepo('1.0.0', { withHook: true });
    writeFileSync(join(dir, 'note.txt'), 'hello\n', 'utf8');
    gitWithHooks(dir, ['add', '--', 'note.txt']);

    gitWithHooks(dir, ['commit', '-q', '-m', 'feat: note']);

    const committed = JSON.parse(git(dir, ['show', 'HEAD:package.json'])) as { version?: string };
    expect(committed.version).toBe('1.0.1');
    expect(git(dir, ['status', '--porcelain'])).toBe('');
    expect(git(dir, ['show', '--name-only', '--pretty=format:', 'HEAD'])).toContain('note.txt');
  });

  it.skipIf(!hasGit)('installs core.hooksPath only when it is unset', () => {
    const dir = createRepo('1.0.0');
    mkdirSync(join(dir, '.githooks'), { recursive: true });
    copyFileSync(hookFile, join(dir, '.githooks', 'pre-commit'));

    expect(runScript(dir, installScript).status).toBe(0);
    expect(git(dir, ['config', '--local', '--get', 'core.hooksPath'])).toBe('.githooks');

    expect(runScript(dir, installScript).status).toBe(0);
    expect(git(dir, ['config', '--local', '--get', 'core.hooksPath'])).toBe('.githooks');

    git(dir, ['config', '--local', 'core.hooksPath', '.custom-hooks']);
    expect(runScript(dir, installScript).status).toBe(0);
    expect(git(dir, ['config', '--local', '--get', 'core.hooksPath'])).toBe('.custom-hooks');
  });

  it.skipIf(!hasGit)('skips the installer outside a git work tree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'abs-version-nogit-'));
    tempDirs.push(dir);

    const result = runScript(dir, installScript);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('不是 git 工作区');
  });
});
