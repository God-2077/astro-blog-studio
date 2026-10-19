import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useGateway } from '@/lib/gateway/context';
import type { RepoInfo, TreeResult } from '@/lib/github/types';
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

/**
 * The HEAD tree is the only content request made on every visit. The local
 * article cache (see `stores/content`) is diffed against it, so untouched
 * repositories never re-read a single blob.
 */
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

/** The editor reads the current remote file on demand; the cache never seeds it. */
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
