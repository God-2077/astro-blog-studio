#!/usr/bin/env node
/**
 * 升级 package.json 的版本号（零依赖）。
 *
 * 用法：
 *   node scripts/bump-version.mjs [patch|minor|major]   手工升版：只改工作区文件
 *   node scripts/bump-version.mjs --stage [kind]        提交钩子：跳过判断 + 改文件 + git add
 *
 * --stage 在以下情况直接跳过（exit 0，不阻塞提交）：
 *   - SKIP_VERSION_BUMP 非空
 *   - 处于 merge / rebase / cherry-pick / revert 中
 *   - 还没有 HEAD（首次提交）
 *   - package.json 未跟踪或不在暂存区
 *   - 暂存区版本与 HEAD 不同（本次已手工升版）
 *   - 版本号不是严格的 x.y.z
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const KINDS = ['patch', 'minor', 'major'];
const PACKAGE_JSON = 'package.json';

const argv = process.argv.slice(2);
const stage = argv.includes('--stage');
const kindArg = argv.find((arg) => !arg.startsWith('--'));
const kind = kindArg ?? 'patch';

function fail(message) {
  console.error(`[version] ${message}`);
  process.exit(1);
}

function skip(message) {
  console.log(`[version] ${message}`);
  process.exit(0);
}

function tryGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

/** 取 git 内部路径（可能是相对 cwd 的路径）；拿不到时返回 null。 */
function gitPath(name) {
  const result = tryGit(['rev-parse', '--git-path', name]);
  if (result === null) return null;
  const value = result.trim();
  return value ? resolve(process.cwd(), value) : null;
}

/**
 * 判断是否处在合并/变基/拣选/回滚中。
 * REBASE_HEAD 在变基结束后可能残留，不能单独作为「变基中」的依据，只认 rebase-merge / rebase-apply 目录。
 */
function operationInProgress() {
  for (const dir of ['rebase-merge', 'rebase-apply']) {
    const path = gitPath(dir);
    if (path && existsSync(path)) return 'REBASE';
  }
  for (const ref of ['CHERRY_PICK_HEAD', 'REVERT_HEAD', 'MERGE_HEAD']) {
    if (tryGit(['rev-parse', '-q', '--verify', ref])) return ref.replace('_HEAD', '');
  }
  return null;
}

function bump(version, target) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (target === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (target === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function readVersion(content) {
  try {
    const parsed = JSON.parse(content);
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

/** 只替换顶层 version 字段的值，保留缩进、字段顺序与结尾换行。 */
function rewrite(content, nextVersion) {
  const pattern = /(^[ \t]*"version"[ \t]*:[ \t]*")(\d+\.\d+\.\d+)(")/m;
  if (!pattern.test(content)) return null;
  const updated = content.replace(pattern, (_match, prefix, _current, suffix) => `${prefix}${nextVersion}${suffix}`);
  try {
    if (JSON.parse(updated).version !== nextVersion) return null;
  } catch {
    return null;
  }
  return updated;
}

function main() {
  if (!KINDS.includes(kind)) fail(`未知的升版类型 "${kind}"，只支持 patch / minor / major。`);

  if (stage) {
    if (process.env.SKIP_VERSION_BUMP) skip('SKIP_VERSION_BUMP 已设置，跳过自动升版。');
    const operation = operationInProgress();
    if (operation) skip(`正在进行 ${operation}，跳过自动升版。`);
    if (!tryGit(['rev-parse', '-q', '--verify', 'HEAD'])) skip('还没有任何提交，跳过自动升版。');
  }

  const filePath = join(process.cwd(), PACKAGE_JSON);
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    if (stage) skip(`${PACKAGE_JSON} 不存在，跳过自动升版。`);
    fail(`读不到 ${filePath}，请在仓库根目录运行。`);
  }

  const currentVersion = readVersion(content);
  if (!currentVersion) {
    if (stage) skip(`${PACKAGE_JSON} 里没有可解析的 version，跳过自动升版。`);
    fail(`${PACKAGE_JSON} 里没有可解析的 version。`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(currentVersion)) {
    if (stage) skip(`version "${currentVersion}" 不是严格的 x.y.z，跳过自动升版。`);
    fail(`version "${currentVersion}" 不是严格的 x.y.z，无法自动升版。`);
  }

  if (stage) {
    const staged = tryGit(['show', `:${PACKAGE_JSON}`]);
    if (staged === null) skip(`${PACKAGE_JSON} 不在暂存区，跳过自动升版。`);
    const head = tryGit(['show', `HEAD:${PACKAGE_JSON}`]);
    const stagedVersion = readVersion(staged);
    const headVersion = head === null ? null : readVersion(head);
    if (!stagedVersion || !headVersion) skip('无法比较暂存区与 HEAD 的版本号，跳过自动升版。');
    if (stagedVersion !== headVersion) {
      skip(`暂存区版本 ${stagedVersion} 与 HEAD ${headVersion} 不同，视为已手工升版，跳过自动升版。`);
    }
  }

  const nextVersion = bump(currentVersion, kind);
  if (!nextVersion) fail(`无法从 "${currentVersion}" 计算下一个版本。`);

  const updated = rewrite(content, nextVersion);
  if (!updated) fail(`无法在 ${PACKAGE_JSON} 中定位版本号字段，文件可能被改坏了。`);

  try {
    writeFileSync(filePath, updated, 'utf8');
  } catch (error) {
    fail(`写入 ${PACKAGE_JSON} 失败：${error instanceof Error ? error.message : String(error)}`);
  }

  if (stage) {
    try {
      execFileSync('git', ['add', '--', PACKAGE_JSON], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      fail(`git add ${PACKAGE_JSON} 失败：${error instanceof Error ? error.message : String(error)}`);
    }
    console.log(`[version] ${currentVersion} → ${nextVersion}（已加入本次提交）`);
    return;
  }

  console.log(`[version] ${currentVersion} → ${nextVersion}`);
  console.log('[version] 手工升版完成；本次提交不会再次 +1。');
}

main();
