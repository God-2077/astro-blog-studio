import type { TreeEntry } from '@/lib/github/types';
import { createExclusionMatcher, isMarkdownFile, isUnderRoot } from '@/lib/paths/paths';

export interface FileNode {
  type: 'file';
  name: string;
  path: string;
  sha: string;
  size?: number;
}

export interface FolderNode {
  type: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = FolderNode | FileNode;

export interface TreeConfig {
  rootDir: string;
  extensions: string[];
  excludes: string[];
}

export interface TreeModel {
  nodes: TreeNode[];
  files: FileNode[];
  totalMarkdown: number;
  excludedCount: number;
}

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
const modelCache = new WeakMap<TreeEntry[], Map<string, TreeModel>>();

function configCacheKey(config: TreeConfig): string {
  return `${config.rootDir}\u0000${config.extensions.join('\u0000')}\u0000${config.excludes.join('\u0000')}`;
}

function stripRoot(path: string, rootDir: string): string {
  const root = rootDir.replace(/^\/+|\/+$/g, '');
  if (!root) return path;
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

export function buildTreeModel(entries: TreeEntry[], config: TreeConfig): TreeModel {
  const cacheKey = configCacheKey(config);
  const cached = modelCache.get(entries)?.get(cacheKey);
  if (cached) return cached;

  const matcher = createExclusionMatcher(config.excludes);
  const relevant = entries.filter(
    (entry) => entry.path && isUnderRoot(entry.path, config.rootDir) && isMarkdownFile(entry.path, config.extensions),
  );
  const visible = relevant.filter((entry) => !matcher.match(entry.path));
  const excludedCount = relevant.length - visible.length;

  const rootNodes: TreeNode[] = [];
  const folderIndex = new Map<string, FolderNode>();

  const ensureFolder = (path: string): FolderNode => {
    const existing = folderIndex.get(path);
    if (existing) return existing;
    const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
    const node: FolderNode = { type: 'folder', name, path, children: [] };
    folderIndex.set(path, node);
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (parentPath) {
      ensureFolder(parentPath).children.push(node);
    } else {
      rootNodes.push(node);
    }
    return node;
  };

  const files: FileNode[] = [];
  for (const entry of visible) {
    const relative = stripRoot(entry.path, config.rootDir);
    const parts = relative.split('/');
    const fileName = parts.pop() ?? relative;
    const folderPath = parts.join('/');
    const parent = folderPath ? ensureFolder(folderPath) : null;
    const file: FileNode = {
      type: 'file',
      name: fileName,
      path: entry.path,
      sha: entry.sha,
      ...(entry.size !== undefined ? { size: entry.size } : {}),
    };
    files.push(file);
    if (parent) parent.children.push(file);
  }

  const sortNodes = (nodes: TreeNode[]): void => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return collator.compare(a.name, b.name);
    });
    for (const node of nodes) {
      if (node.type === 'folder') sortNodes(node.children);
    }
  };

  sortNodes(rootNodes);
  files.sort((a, b) => collator.compare(a.path, b.path));

  const model: TreeModel = { nodes: rootNodes, files, totalMarkdown: files.length, excludedCount };
  const byConfig = modelCache.get(entries) ?? new Map<string, TreeModel>();
  byConfig.set(cacheKey, model);
  modelCache.set(entries, byConfig);
  return model;
}

export function collectFolders(nodes: TreeNode[]): FolderNode[] {
  const folders: FolderNode[] = [];
  const visit = (list: TreeNode[]): void => {
    for (const node of list) {
      if (node.type === 'folder') {
        folders.push(node);
        visit(node.children);
      }
    }
  };
  visit(nodes);
  return folders;
}
