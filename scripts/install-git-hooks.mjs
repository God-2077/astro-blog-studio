#!/usr/bin/env node
/**
 * 把本仓库的 git core.hooksPath 指向 .githooks（幂等，零依赖）。
 * pnpm install 会通过 prepare 自动执行；也可手动 pnpm hooks:install。
 * 已有自定义 core.hooksPath 时不覆盖，只提示。
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const HOOKS_PATH = '.githooks';
const HOOK_FILE = 'pre-commit';

function tryGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

const topLevel = tryGit(['rev-parse', '--show-toplevel']);
if (!topLevel) {
  console.log('[hooks] 当前目录不是 git 工作区，跳过自动启用钩子。');
  process.exit(0);
}

if (!existsSync(join(topLevel, HOOKS_PATH, HOOK_FILE))) {
  console.log(`[hooks] 未找到 ${HOOKS_PATH}/${HOOK_FILE}，跳过自动启用钩子。`);
  process.exit(0);
}

const current = tryGit(['config', '--local', '--get', 'core.hooksPath']);
if (current === HOOKS_PATH || current === `./${HOOKS_PATH}`) {
  console.log(`[hooks] 已启用：core.hooksPath=${HOOKS_PATH}。`);
  process.exit(0);
}

if (current !== null) {
  console.warn(`[hooks] 已存在自定义 core.hooksPath=${current}，未修改。`);
  console.warn(`[hooks] 如需自动升版，请执行：git config --local core.hooksPath ${HOOKS_PATH}`);
  process.exit(0);
}

try {
  execFileSync('git', ['config', '--local', 'core.hooksPath', HOOKS_PATH], {
    cwd: topLevel,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (error) {
  console.warn(`[hooks] 设置 core.hooksPath 失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(0);
}

console.log(`[hooks] 已启用 ${HOOKS_PATH}：每次 git commit 自动把 package.json 修订号 +1。`);
