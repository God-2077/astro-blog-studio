import { readFile } from 'node:fs/promises';
import type { Download } from '@playwright/test';

/** 把下载文件读成 JSON；Playwright 会在测试结束前保留该文件。 */
export async function readDownloadedJson<T>(download: Download): Promise<T> {
  const path = await download.path();
  if (!path) throw new Error('download path is unavailable');
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
