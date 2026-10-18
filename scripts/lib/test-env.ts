import { Buffer } from 'node:buffer';
import { Octokit } from '@octokit/rest';
import { config } from 'dotenv';

config({ path: '.env.local' });

export interface TestEnv {
  token: string;
  owner: string;
  name: string;
  branch: string;
  slug: string;
}

export function readTestEnv(requireToken = true): TestEnv | null {
  const token = process.env.GITHUB_TEST_TOKEN?.trim();
  const slug = process.env.GITHUB_TEST_REPO?.trim() || 'God-2077/astro-blog-content-test';
  const branch = process.env.GITHUB_TEST_BRANCH?.trim() || 'main';
  const [owner, name] = slug.split('/');
  if (!owner || !name) throw new Error('GITHUB_TEST_REPO must be owner/repository');
  if (!token && requireToken) {
    console.error('GITHUB_TEST_TOKEN is missing. Copy .env.example to .env.local and fill the token.');
    return null;
  }
  return { token: token ?? '', owner, name, branch, slug };
}

export function createTestOctokit(token: string): Octokit {
  return new Octokit({
    auth: token,
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  });
}

export function encodeBase64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

export function decodeBase64(value: string): string {
  return Buffer.from(value.replace(/\s/g, ''), 'base64').toString('utf8');
}

export function redact(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(/github_pat_[A-Za-z0-9_]+/g, 'github_pat_***').replace(/gh[pousr]_[A-Za-z0-9_]+/g, 'gh*_***');
}

export const seedFiles: Array<{ path: string; text: string }> = [
  {
    path: 'src/content/blog/post/hello-world.md',
    text: `---
title: 'Hello World'
date: '2026-01-01 00:00:00'
categories:
- 文章
---
A seeded post for the studio integration tests.
`,
  },
  {
    path: 'src/content/blog/note/便笺-测试.md',
    text: `---
title: '便笺：测试'
date: '2026-01-02 09:30:00'
updated: '2026-01-03 10:00:00'
categories:
- 笔记
tags:
- test
---
这是 studio 的种子文件，故意使用 CRLF 换行。

- 列表项
- 第二项
`.replaceAll('\n', '\r\n'),
  },
  {
    path: 'src/content/blog/en/hello-world.md',
    text: `---
title: 'Hello World (en)'
date: '2026-01-01 00:00:00'
---
Excluded by the studio's default rules.
`,
  },
  {
    path: 'src/pages/about.md',
    text: `---
title: 'About'
date: '2026-01-01 00:00:00'
---
About page seed.
`,
  },
  {
    path: 'src/pages/en/about.md',
    text: `---
title: 'About (en)'
date: '2026-01-01 00:00:00'
---
Excluded page seed.
`,
  },
];
