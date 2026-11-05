import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '@/lib/i18n';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[studio] render error', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="abs-shell flex min-h-screen items-center justify-center">
          <div className="max-w-[520px] rounded-2xl border-[1.5px] border-edge bg-paper p-6 shadow-sheet">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-sakura">studio crashed</p>
            <h1 className="mt-1 font-display text-[24px] font-bold">{t('errors.boundary.title')}</h1>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{t('errors.boundary.note')}</p>
            <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-blush-2 p-3 font-mono text-[10px] text-danger">
              {this.state.error.message}
            </pre>
            <div className="mt-4 flex gap-2">
              <button type="button" className="abs-btn abs-btn-primary" onClick={() => window.location.reload()}>
                {t('errors.boundary.reload')}
              </button>
              <button
                type="button"
                className="abs-btn abs-btn-ghost"
                onClick={() => window.location.assign(window.location.pathname)}
              >
                {t('errors.boundary.home')}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
