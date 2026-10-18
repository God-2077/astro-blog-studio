import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { ErrorBoundary } from '@/components/error-boundary';
import { ProtectedLayout } from '@/components/protected-layout';
import { PwaUpdate } from '@/components/pwa-update';
import { ThemeProvider } from '@/components/theme-provider';
import { Spinner } from '@/components/ui';
import { DashboardPage } from '@/pages/dashboard';
import { SettingsPage } from '@/pages/settings';
import { SetupPage } from '@/pages/setup';
import { UnlockPage } from '@/pages/unlock';

const EditorPage = lazy(async () => {
  const module = await import('@/pages/editor');
  return { default: module.EditorPage };
});

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

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <PwaUpdate />
          <HashRouter>
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
            toastOptions={{
              className: 'font-body text-[12px]',
              style: { background: 'var(--abs-paper)', border: '1.5px solid var(--abs-edge)', color: 'var(--abs-ink)' },
            }}
          />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
