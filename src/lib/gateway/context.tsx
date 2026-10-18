import { createContext, type ReactNode, useContext, useEffect, useMemo } from 'react';
import { demoContentConfig, demoRepo } from '@/lib/demo/fixtures';
import { FixtureGateway } from '@/lib/github/fixture';
import type { GitHubGateway, RepoInfo } from '@/lib/github/types';
import { useRateLimit } from '@/stores/rate-limit';

export type AppMode = 'demo' | 'live';

export interface StudioConfig {
  rootDir: string;
  extensions: string[];
  excludes: string[];
  timezone: string;
}

export interface GatewayValue {
  mode: AppMode;
  gateway: GitHubGateway;
  repo: RepoInfo;
  config: StudioConfig;
  key: string;
}

const GatewayContext = createContext<GatewayValue | null>(null);

export function GatewayProvider({
  mode,
  gateway,
  repo,
  config,
  children,
}: {
  mode: AppMode;
  gateway: GitHubGateway;
  repo: RepoInfo;
  config: StudioConfig;
  children: ReactNode;
}) {
  const value = useMemo<GatewayValue>(
    () => ({
      mode,
      gateway,
      repo,
      config,
      key: `${mode}:${repo.owner}/${repo.name}@${config.rootDir}`,
    }),
    [mode, gateway, repo, config],
  );
  return <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>;
}

export function useGateway(): GatewayValue {
  const value = useContext(GatewayContext);
  if (!value) throw new Error('useGateway must be used inside GatewayProvider');
  return value;
}

export function DemoGatewayProvider({ children }: { children: ReactNode }) {
  const gateway = useMemo(() => new FixtureGateway(), []);
  const setRate = useRateLimit((state) => state.set);

  useEffect(() => {
    setRate({ limit: 5000, remaining: 4812, resetAt: Date.now() + 38 * 60_000 });
  }, [setRate]);

  return (
    <GatewayProvider mode="demo" gateway={gateway} repo={demoRepo} config={demoContentConfig}>
      {children}
    </GatewayProvider>
  );
}

export function isDemoRequested(): boolean {
  if (typeof window === 'undefined') return false;
  const outer = new URLSearchParams(window.location.search).get('demo');
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  const inner = queryIndex >= 0 ? new URLSearchParams(hash.slice(queryIndex + 1)).get('demo') : null;
  return outer === '1' || inner === '1';
}
