export interface RepoRef {
  owner: string;
  name: string;
  branch: string;
}

export interface RepoInfo {
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
  canPush: boolean;
  htmlUrl: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface TreeEntry {
  path: string;
  sha: string;
  size?: number;
}

export interface TreeResult {
  entries: TreeEntry[];
  truncated: boolean;
  sha: string;
}

export interface FileContent {
  path: string;
  text: string;
  sha: string;
  size: number;
}

export interface CommitResult {
  sha: string;
  message: string;
  htmlUrl?: string;
  contentSha?: string;
}

export interface FileWriteInput {
  path: string;
  text: string;
  message: string;
  branch: string;
  sha?: string;
}

export interface FileDeleteInput {
  path: string;
  message: string;
  branch: string;
  sha: string;
}

export interface FileMoveInput {
  from: string;
  to: string;
  text: string;
  message: string;
  branch: string;
  sha: string;
}

export interface GitHubGateway {
  getRepo(): Promise<RepoInfo>;
  getTree(): Promise<TreeResult>;
  readFile(path: string): Promise<FileContent>;
  readFiles(paths: string[]): Promise<FileContent[]>;
  readBlob(sha: string): Promise<Uint8Array>;
  writeFile(input: FileWriteInput): Promise<CommitResult>;
  deleteFile(input: FileDeleteInput): Promise<CommitResult>;
  moveFile(input: FileMoveInput): Promise<CommitResult>;
}
