import { useMemo } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { DemoGatewayProvider, GatewayProvider, isDemoRequested } from '@/lib/gateway/context';
import { LiveGateway } from '@/lib/github/live';
import { vaultSession } from '@/lib/vault/session';
import { useRateLimit } from '@/stores/rate-limit';
import { useSettings } from '@/stores/settings';
import { useVault } from '@/stores/vault';

export function ProtectedLayout() {
  const settings = useSettings();
  const vault = useVault();
  const demo = isDemoRequested();
  const repo = settings.repo;

  const gateway = useMemo(() => {
    if (!repo || vault.status !== 'unlocked') return null;
    const token = vaultSession.get();
    if (!token) return null;
    return new LiveGateway({
      token,
      owner: repo.owner,
      name: repo.name,
      branch: repo.branch,
      onRateLimit: (info) => useRateLimit.getState().set(info),
    });
  }, [repo, vault.status]);

  if (demo) {
    return (
      <DemoGatewayProvider>
        <Outlet />
      </DemoGatewayProvider>
    );
  }

  if (!repo) return <Navigate to="/setup" replace />;
  if (vault.status === 'empty') return <Navigate to="/setup" replace />;
  if (vault.status === 'locked') return <Navigate to="/unlock" replace />;
  if (!gateway) return <Navigate to="/unlock" replace />;

  const info = {
    owner: repo.owner,
    name: repo.name,
    defaultBranch: repo.branch,
    private: true,
    canPush: true,
    htmlUrl: `https://github.com/${repo.owner}/${repo.name}`,
  };

  return (
    <GatewayProvider mode="live" gateway={gateway} repo={info} config={settings.content}>
      <Outlet />
    </GatewayProvider>
  );
}
