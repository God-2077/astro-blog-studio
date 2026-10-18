import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useGateway } from '@/lib/gateway/context';
import type { RepoInfo, TreeResult } from '@/lib/github/types';
import { parseDocument } from '@/lib/markdown/document';
import { buildTreeModel, type TreeModel } from '@/lib/tree/model';

export function useRepoInfo() {
  const { gateway, key, repo } = useGateway();
  return useQuery<RepoInfo>({
    queryKey: ['repo', key],
    queryFn: () => gateway.getRepo(),
    initialData: repo,
    staleTime: 60_000,
  });
}

export function useTree() {
  const { gateway, key } = useGateway();
  return useQuery<TreeResult>({
    queryKey: ['tree', key],
    queryFn: () => gateway.getTree(),
    staleTime: 30_000,
  });
}

export function useTreeModel(): { tree: ReturnType<typeof useTree>; model: TreeModel | null } {
  const tree = useTree();
  const { config } = useGateway();
  const model = useMemo(
    () =>
      tree.data
        ? buildTreeModel(tree.data.entries, {
            rootDir: config.rootDir,
            extensions: config.extensions,
            excludes: config.excludes,
          })
        : null,
    [tree.data, config.rootDir, config.extensions, config.excludes],
  );
  return { tree, model };
}

export function useFile(path: string | null) {
  const { gateway, key } = useGateway();
  return useQuery({
    queryKey: ['file', key, path],
    queryFn: () => {
      if (!path) throw new Error('missing path');
      return gateway.readFile(path);
    },
    enabled: Boolean(path),
    staleTime: 60_000,
  });
}

export interface PostSummary {
  path: string;
  title: string;
  date: string;
  updated?: string;
  categories: string[];
  tags: string[];
  draft: boolean;
  sticky: boolean;
  encrypted: boolean;
  frontmatterError: boolean;
  bodyLength: number;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function flattenCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (Array.isArray(item)) result.push(...item.filter((part): part is string => typeof part === 'string'));
    else if (typeof item === 'string') result.push(item);
  }
  return [...new Set(result)];
}

function flattenTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is string => typeof tag === 'string');
}

export function summarize(text: string, path: string): PostSummary {
  const parsed = parseDocument(text);
  const data = parsed.data;
  const title = asString(data.title) ?? path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  return {
    path,
    title,
    date: asString(data.date) ?? '',
    updated: asString(data.updated),
    categories: flattenCategories(data.categories),
    tags: flattenTags(data.tags),
    draft: data.draft === true,
    sticky: data.sticky === true,
    encrypted: Boolean(data.password),
    frontmatterError: Boolean(parsed.frontmatterError),
    bodyLength: parsed.body.length,
  };
}

export function usePostSummaries(paths: string[], limit = 12) {
  const { gateway, key } = useGateway();
  const selected = useMemo(() => paths.slice(0, limit), [paths, limit]);
  const queries = useQueries({
    queries: selected.map((path) => ({
      queryKey: ['file', key, path],
      queryFn: () => gateway.readFile(path),
      staleTime: 60_000,
    })),
  });

  const summaries = useMemo(() => {
    const list: PostSummary[] = [];
    queries.forEach((query, index) => {
      const path = selected[index];
      if (query.data && path) list.push(summarize(query.data.text, path));
    });
    return list;
  }, [queries, selected]);

  return {
    summaries,
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.every((query) => query.isError),
    scanned: queries.filter((query) => query.data).length,
  };
}
