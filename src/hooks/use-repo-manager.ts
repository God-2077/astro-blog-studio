import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useParkPendingDraft } from '@/hooks/use-pending-draft';
import type { RepoProfile } from '@/lib/config/schema';
import { mapError } from '@/lib/github/errors';
import { LiveGateway } from '@/lib/github/live';
import { parseRepoInput } from '@/lib/github/repo-input';
import { repoProfileKey, repoTokenKey } from '@/lib/repos/identity';
import { profileFromSettings } from '@/lib/repos/profile';
import { vaultSession } from '@/lib/vault/session';
import { useContent } from '@/stores/content';
import { useDrafts } from '@/stores/drafts';
import { useLastCommit } from '@/stores/last-commit';
import { useRateLimit } from '@/stores/rate-limit';
import { useSettings } from '@/stores/settings';
import { useVault } from '@/stores/vault';

export interface AddRepoInput {
  repoInput: string;
  branch: string;
  token: string;
  rootDir: string;
  excludes: string;
}

function errorMessage(caught: unknown): Error {
  if (!(caught instanceof Error)) return new Error(String(caught));
  const mapped = mapError(caught);
  // Keep our own readable errors (e.g. VaultError) instead of collapsing them
  // into the generic UNKNOWN message just because they are not HTTP errors.
  if (mapped.code === 'UNKNOWN') return caught;
  return new Error(mapped.detail ?? mapped.message);
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Repository operations that must keep the active repository and all local
 * caches consistent:
 * - switch archives the current settings and loads the target profile;
 * - add validates the PAT, writes it to the vault, then activates the profile;
 * - remove only touches inactive profiles and cleans a shared slug's PAT when
 *   no other profile uses it.
 *
 * IndexedDB article/draft/backup rows are never cleared here. Only in-memory
 * decrypted views and React Query caches are dropped so the target repository
 * reloads its own encrypted cache.
 */
export function useRepoManager() {
  const queryClient = useQueryClient();
  const parkPendingDraft = useParkPendingDraft();

  const clearInMemory = useCallback(() => {
    useContent.getState().reset();
    useDrafts.getState().reset();
    useLastCommit.getState().clear();
    useRateLimit.getState().reset();
    queryClient.clear();
  }, [queryClient]);

  const park = useCallback(async (): Promise<void> => {
    const result = await parkPendingDraft();
    if (result === 'failed') {
      throw new Error('上一篇新稿没能存入草稿箱，操作已取消；请先处理好那篇新稿。');
    }
  }, [parkPendingDraft]);

  const switchRepo = useCallback(
    async (key: string): Promise<void> => {
      const target = useSettings.getState().repos.find((profile) => repoProfileKey(profile) === key);
      if (!target) throw new Error('没有找到要切换的仓库。');
      const tokenKey = repoTokenKey(target);
      if (!vaultSession.hasStoredTokenForRepo(tokenKey)) {
        throw new Error('这个仓库缺少 PAT，请先更新令牌。');
      }
      await park();
      if (!useSettings.getState().activateRepo(key)) {
        throw new Error('切换仓库失败，请刷新后再试。');
      }
      clearInMemory();
    },
    [park, clearInMemory],
  );

  const addRepo = useCallback(
    async (input: AddRepoInput): Promise<void> => {
      const parsed = parseRepoInput(input.repoInput);
      if (!parsed) throw new Error('仓库格式应为 owner/repository，或完整的 GitHub URL。');

      const tokenKey = repoTokenKey(parsed);
      const enteredToken = input.token.trim();
      const existingToken = vaultSession.getStoredTokenForRepo(tokenKey);
      const token = enteredToken || existingToken;
      if (!token) throw new Error('请先输入这个仓库的 PAT。');

      const branchInput = input.branch.trim();
      const gateway = new LiveGateway({
        token,
        owner: parsed.owner,
        name: parsed.name,
        branch: branchInput || 'main',
      });
      let info: Awaited<ReturnType<LiveGateway['getRepo']>>;
      try {
        info = await gateway.getRepo();
      } catch (caught) {
        throw errorMessage(caught);
      }

      const repo = { ...parsed, branch: branchInput || info.defaultBranch };
      const key = repoProfileKey(repo);
      const state = useSettings.getState();
      if (state.repo && repoProfileKey(state.repo) === key) {
        throw new Error('这个仓库和分支已经添加过了。');
      }
      if (state.repos.some((profile) => repoProfileKey(profile) === key)) {
        throw new Error('这个仓库和分支已经添加过了。');
      }

      await park();

      if (enteredToken && enteredToken !== existingToken) {
        try {
          await useVault.getState().addRepoToken(tokenKey, enteredToken);
        } catch (caught) {
          throw errorMessage(caught);
        }
      }

      const latest = useSettings.getState();
      const profile = profileFromSettings(latest, repo, {
        rootDir: input.rootDir.trim() || 'src',
        excludes: splitLines(input.excludes),
      });
      if (!latest.addRepo(profile)) throw new Error('这个仓库和分支已经添加过了。');
      if (!useSettings.getState().activateRepo(key)) {
        throw new Error('仓库已添加，但切换失败；请刷新后在仓库列表里手动切换。');
      }
      clearInMemory();
    },
    [park, clearInMemory],
  );

  const updateToken = useCallback(
    async (profile: RepoProfile, token: string): Promise<void> => {
      const value = token.trim();
      if (!value) throw new Error('请输入新的 PAT。');
      const gateway = new LiveGateway({
        token: value,
        owner: profile.owner,
        name: profile.name,
        branch: profile.branch,
      });
      try {
        await gateway.getRepo();
        await useVault.getState().addRepoToken(repoTokenKey(profile), value);
      } catch (caught) {
        throw errorMessage(caught);
      }
      const active = useSettings.getState().repo;
      if (active && repoTokenKey(active) === repoTokenKey(profile)) {
        useRateLimit.getState().reset();
        await queryClient.invalidateQueries();
      }
    },
    [queryClient],
  );

  const removeRepo = useCallback(async (profile: RepoProfile): Promise<void> => {
    const key = repoProfileKey(profile);
    const state = useSettings.getState();
    if (state.repo && repoProfileKey(state.repo) === key) {
      throw new Error('当前正在使用这个仓库，请先切换到其他仓库。');
    }
    const tokenKey = repoTokenKey(profile);
    const stillUsed =
      (state.repo && repoTokenKey(state.repo) === tokenKey) ||
      state.repos.some((item) => repoProfileKey(item) !== key && repoTokenKey(item) === tokenKey);

    // Remove the PAT first: if the vault write fails, keep the profile so the
    // user can retry instead of leaving a repository without a token.
    if (!stillUsed) await useVault.getState().removeRepoToken(tokenKey);
    if (!useSettings.getState().removeRepo(key)) throw new Error('没有找到要移除的仓库。');
  }, []);

  return { switchRepo, addRepo, updateToken, removeRepo };
}
