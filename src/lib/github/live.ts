import { Octokit } from '@octokit/rest';
import { AppError, mapError } from '@/lib/github/errors';
import type {
  CommitResult,
  FileContent,
  FileDeleteInput,
  FileMoveInput,
  FileWriteInput,
  GitHubGateway,
  RateLimitInfo,
  RepoInfo,
  TreeEntry,
  TreeResult,
} from '@/lib/github/types';
import { base64ToBytes, bytesToBase64, decodeUtf8, encodeUtf8 } from '@/lib/utils/encoding';

interface LiveGatewayOptions {
  token: string;
  owner: string;
  name: string;
  branch: string;
  onRateLimit?: (info: RateLimitInfo) => void;
  fetchImpl?: typeof fetch;
}

const MAX_FILE_BYTES = 900_000;
const API_VERSION = '2022-11-28';

export class LiveGateway implements GitHubGateway {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly name: string;
  private readonly branch: string;

  constructor(options: LiveGatewayOptions) {
    this.owner = options.owner;
    this.name = options.name;
    this.branch = options.branch;
    this.octokit = new Octokit({
      auth: options.token,
      ...(options.fetchImpl ? { request: { fetch: options.fetchImpl } } : {}),
      log: {
        debug: () => {},
        info: () => {},
        warn: (message: string) => {
          if (import.meta.env.DEV) console.warn('[studio]', message);
        },
        error: () => {},
      },
      headers: {
        'X-GitHub-Api-Version': API_VERSION,
      },
    });

    this.octokit.hook.after('request', (response) => {
      const headers = response.headers as Record<string, string | undefined>;
      const limit = Number(headers['x-ratelimit-limit']);
      const remaining = Number(headers['x-ratelimit-remaining']);
      const reset = Number(headers['x-ratelimit-reset']);
      if (Number.isFinite(limit) && Number.isFinite(remaining)) {
        options.onRateLimit?.({
          limit,
          remaining,
          resetAt: Number.isFinite(reset) ? reset * 1000 : Date.now() + 60_000,
        });
      }
    });
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw mapError(error);
    }
  }

  async getRepo(): Promise<RepoInfo> {
    return this.call(async () => {
      const { data } = await this.octokit.repos.get({ owner: this.owner, repo: this.name });
      return {
        owner: this.owner,
        name: this.name,
        defaultBranch: data.default_branch,
        private: data.private,
        canPush: data.permissions?.push ?? true,
        htmlUrl: data.html_url,
      };
    });
  }

  async getTree(): Promise<TreeResult> {
    return this.call(async () => {
      const { data } = await this.octokit.git.getTree({
        owner: this.owner,
        repo: this.name,
        tree_sha: this.branch,
        recursive: '1',
      });
      const entries: TreeEntry[] = data.tree
        .filter((item) => item.type === 'blob' && item.path && item.sha)
        .map((item) => ({ path: item.path as string, sha: item.sha as string, size: item.size }));
      return { entries, truncated: data.truncated, sha: data.sha };
    });
  }

  async readFile(path: string): Promise<FileContent> {
    return this.call(async () => {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.name,
        path,
        ref: this.branch,
      });
      if (Array.isArray(data) || data.type !== 'file') {
        throw new AppError('NOT_FOUND', { detail: path });
      }
      if (data.size > MAX_FILE_BYTES) {
        throw new AppError('UNSUPPORTED', { message: `文件超过 ${MAX_FILE_BYTES} 字节，请用本地 Git 编辑。` });
      }
      let bytes: Uint8Array;
      if (data.content && data.encoding === 'base64') {
        bytes = base64ToBytes(data.content);
      } else {
        const blob = await this.octokit.git.getBlob({
          owner: this.owner,
          repo: this.name,
          file_sha: data.sha,
        });
        bytes = base64ToBytes(blob.data.content);
      }
      const text = decodeUtf8(bytes);
      return { path, text, sha: data.sha, size: data.size };
    });
  }

  async readBlob(sha: string): Promise<Uint8Array> {
    return this.call(async () => {
      const { data } = await this.octokit.git.getBlob({
        owner: this.owner,
        repo: this.name,
        file_sha: sha,
      });
      return base64ToBytes(data.content);
    });
  }

  async writeFile(input: FileWriteInput): Promise<CommitResult> {
    return this.call(async () => {
      const { data } = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.name,
        path: input.path,
        message: input.message,
        content: bytesToBase64(encodeUtf8(input.text)),
        branch: input.branch,
        ...(input.sha ? { sha: input.sha } : {}),
      });
      return {
        sha: data.commit.sha ?? '',
        message: input.message,
        htmlUrl: data.commit.html_url ?? undefined,
        contentSha: data.content?.sha,
      };
    });
  }

  async deleteFile(input: FileDeleteInput): Promise<CommitResult> {
    return this.call(async () => {
      const { data } = await this.octokit.repos.deleteFile({
        owner: this.owner,
        repo: this.name,
        path: input.path,
        message: input.message,
        sha: input.sha,
        branch: input.branch,
      });
      return {
        sha: data.commit.sha ?? '',
        message: input.message,
        htmlUrl: data.commit.html_url ?? undefined,
      };
    });
  }

  async moveFile(input: FileMoveInput): Promise<CommitResult> {
    return this.call(async () => {
      const current = await this.readFile(input.from);
      if (current.sha !== input.sha) {
        throw new AppError('CONFLICT', { detail: '远端文件已更新，先刷新再移动。' });
      }

      const ref = await this.octokit.request('GET /repos/{owner}/{repo}/git/ref/heads/{branch}', {
        owner: this.owner,
        repo: this.name,
        branch: input.branch,
      });
      const headSha = ref.data.object.sha as string;
      const headCommit = await this.octokit.request('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
        owner: this.owner,
        repo: this.name,
        commit_sha: headSha,
      });
      const tree = await this.octokit.request('POST /repos/{owner}/{repo}/git/trees', {
        owner: this.owner,
        repo: this.name,
        base_tree: headCommit.data.tree.sha,
        tree: [
          { path: input.to, mode: '100644', type: 'blob', content: input.text },
          { path: input.from, mode: '100644', type: 'blob', sha: null },
        ] as never,
      });
      const commit = await this.octokit.request('POST /repos/{owner}/{repo}/git/commits', {
        owner: this.owner,
        repo: this.name,
        message: input.message,
        tree: tree.data.sha,
        parents: [headSha],
      });
      await this.octokit.request('PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}', {
        owner: this.owner,
        repo: this.name,
        branch: input.branch,
        sha: commit.data.sha,
        force: false,
      });
      return {
        sha: commit.data.sha,
        message: input.message,
        htmlUrl: commit.data.html_url ?? undefined,
      };
    });
  }
}
