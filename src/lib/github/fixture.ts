import { demoRepo, demoSeed } from '@/lib/demo/fixtures';
import { AppError } from '@/lib/github/errors';
import type {
  CommitResult,
  FileContent,
  FileDeleteInput,
  FileMoveInput,
  FileWriteInput,
  GitHubGateway,
  RepoInfo,
  TreeEntry,
  TreeResult,
} from '@/lib/github/types';

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function shaFor(text: string): string {
  return `demo-${fnv1a(text)}-${text.length.toString(16)}`;
}

function commitSha(counter: number): string {
  return `demo-commit-${counter.toString(16)}`;
}

export class FixtureGateway implements GitHubGateway {
  private readonly files = new Map<string, { text: string; sha: string }>();
  private commits = 0;
  private readonly repoInfo: RepoInfo;

  constructor(seed: Record<string, string> = demoSeed, repo: RepoInfo = demoRepo) {
    for (const [path, text] of Object.entries(seed)) {
      this.files.set(path, { text, sha: shaFor(text) });
    }
    this.repoInfo = repo;
  }

  async getRepo(): Promise<RepoInfo> {
    return this.repoInfo;
  }

  async getTree(): Promise<TreeResult> {
    const entries: TreeEntry[] = [...this.files.entries()].map(([path, file]) => ({
      path,
      sha: file.sha,
      size: new Blob([file.text]).size,
    }));
    return { entries, truncated: false, sha: `demo-tree-${entries.length}` };
  }

  async readFile(path: string): Promise<FileContent> {
    const file = this.files.get(path);
    if (!file) throw new AppError('NOT_FOUND', { detail: path });
    return { path, text: file.text, sha: file.sha, size: new Blob([file.text]).size };
  }

  async readBlob(): Promise<Uint8Array> {
    throw new AppError('UNSUPPORTED', { message: '演示模式没有二进制文件。' });
  }

  private commit(message: string): CommitResult {
    this.commits += 1;
    return { sha: commitSha(this.commits), message };
  }

  async writeFile(input: FileWriteInput): Promise<CommitResult> {
    const existing = this.files.get(input.path);
    if (input.sha && existing && existing.sha !== input.sha) {
      throw new AppError('CONFLICT', { detail: '远端文件已更新。' });
    }
    if (!input.sha && existing) {
      throw new AppError('CONFLICT', { detail: '同名文件已存在。' });
    }
    this.files.set(input.path, { text: input.text, sha: shaFor(input.text) });
    return { ...this.commit(input.message), contentSha: shaFor(input.text) };
  }

  async deleteFile(input: FileDeleteInput): Promise<CommitResult> {
    const existing = this.files.get(input.path);
    if (!existing) throw new AppError('NOT_FOUND', { detail: input.path });
    if (existing.sha !== input.sha) throw new AppError('CONFLICT');
    this.files.delete(input.path);
    return this.commit(input.message);
  }

  async moveFile(input: FileMoveInput): Promise<CommitResult> {
    const existing = this.files.get(input.from);
    if (!existing) throw new AppError('NOT_FOUND', { detail: input.from });
    if (existing.sha !== input.sha) throw new AppError('CONFLICT');
    if (this.files.has(input.to)) throw new AppError('CONFLICT', { detail: '目标路径已存在。' });
    this.files.delete(input.from);
    this.files.set(input.to, { text: input.text, sha: shaFor(input.text) });
    return this.commit(input.message);
  }
}
