import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { dismissConfirm } from '@/components/confirm-toast';
import { ErrorBoundary } from '@/components/error-boundary';
import { ProtectedLayout } from '@/components/protected-layout';
import { PwaUpdate } from '@/components/pwa-update';
import { ThemeProvider } from '@/components/theme-provider';
import { Spinner } from '@/components/ui';
import { DashboardPage } from '@/pages/dashboard';
import { SettingsPage } from '@/pages/settings';
import { SetupPage } from '@/pages/setup';
import { UnlockPage } from '@/pages/unlock';
import { useVault } from '@/stores/vault';

const EditorPage = lazy(async () => {
  const module = await import('@/pages/editor');
  return { default: module.EditorPage };
});

/** 路由变了，上一条确认就不再对应屏幕上的内容：按取消收口，避免离开后误点。 */
function DismissConfirmOnNavigate(): null {
  const location = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: 路径或查询变化都要收起确认
  useEffect(() => {
    dismissConfirm();
  }, [location.pathname, location.search]);
  return null;
}

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
  );
  const vaultStatus = useVault((state) => state.status);

  // Locking must also drop decrypted article/file data kept by React Query.
  useEffect(() => {
    if (vaultStatus !== 'unlocked') queryClient.clear();
  }, [vaultStatus, queryClient]);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <PwaUpdate />
          <HashRouter>
            <DismissConfirmOnNavigate />
            <Routes>
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/unlock" element={<UnlockPage />} />
              <Route element={<ProtectedLayout />}>
                <Route element={<AppShell />}>
                  <Route index element={<DashboardPage />} />
                  <Route
                    path="edit"
                    element={
                      <Suspense
                        fallback={
                          <div className="abs-paper p-6">
                            <Spinner label="加载编辑器" />
                          </div>
                        }
                      >
                        <EditorPage />
                      </Suspense>
                    }
                  />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
          <Toaster
            position="top-center"
            closeButton
            toastOptions={{
              className: 'font-body text-[12px]',
              classNames: { closeButton: 'abs-toast-close' },
              closeButtonAriaLabel: '关闭提示',
              style: { background: 'var(--abs-paper)', border: '1.5px solid var(--abs-edge)', color: 'var(--abs-ink)' },
            }}
          />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
