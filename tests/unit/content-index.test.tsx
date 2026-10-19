// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { useContentActions, useContentSync } from '@/hooks/use-content-sync';
import { defaultSettings } from '@/lib/config/defaults';
import { demoContentConfig, demoRepo } from '@/lib/demo/fixtures';
import { GatewayProvider } from '@/lib/gateway/context';
import { FixtureGateway } from '@/lib/github/fixture';
import type { FileContent } from '@/lib/github/types';
import { useContent } from '@/stores/content';
import { useSettings } from '@/stores/settings';

afterEach(() => {
  cleanup();
  useContent.getState().reset();
  useSettings.setState({ content: { ...defaultSettings.content } });
});

function buildSeed(count: number): Record<string, string> {
  const seed: Record<string, string> = {};
  for (let index = 0; index < count; index += 1) {
    const day = String(index + 1).padStart(2, '0');
    seed[`src/content/blog/post/${String(index).padStart(2, '0')}.md`] =
      `---\ntitle: 'T${index}'\ndate: '2026-01-${day}'\n---\nbody ${index}\n`;
  }
  return seed;
}

class CountingGateway extends FixtureGateway {
  batchCalls = 0;

  override async readFiles(paths: string[]): Promise<FileContent[]> {
    this.batchCalls += 1;
    return super.readFiles(paths);
  }
}

class SlowTreeGateway extends CountingGateway {
  delayMs = 0;

  override async getTree() {
    if (this.delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
    return super.getTree();
  }
}

function Probe() {
  useContentSync();
  const content = useContent();
  const { checkNow, busy, pending } = useContentActions();
  return (
    <div>
      <span data-testid="status">{content.status}</span>
      <span data-testid="count">{content.summaries.length}</span>
      <span data-testid="cached">{content.cachedCount}</span>
      <span data-testid="indexed">{content.indexed}</span>
      <span data-testid="titles">{content.summaries.map((post) => post.title).join('|')}</span>
      <span data-testid="busy">{String(busy)}</span>
      <span data-testid="pending">{String(pending)}</span>
      <button type="button" onClick={() => void checkNow()}>
        check
      </button>
    </div>
  );
}

function renderProbe(gateway: FixtureGateway) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <GatewayProvider mode="demo" gateway={gateway} repo={demoRepo} config={demoContentConfig}>
        <Probe />
      </GatewayProvider>
    </QueryClientProvider>,
  );
  return { client, ...view };
}

async function waitForCount(count: number): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('count').textContent).toBe(String(count)));
}

describe('local article cache', () => {
  it('first load reads the whole visible corpus in 20-file batches', async () => {
    const gateway = new CountingGateway(buildSeed(25));
    renderProbe(gateway);

    await waitForCount(25);
    expect(screen.getByTestId('status').textContent).toBe('ready');
    expect(screen.getByTestId('indexed').textContent).toBe('25');
    // 25 files / 20 per readFiles call.
    expect(gateway.batchCalls).toBe(2);
    // Path order is preserved for the cached summary list.
    expect(screen.getByTestId('titles').textContent?.split('|')[0]).toBe('T0');
  });

  it('serves a second mount from the cache without reading any blob', async () => {
    const gateway = new CountingGateway(buildSeed(25));
    const first = renderProbe(gateway);
    await waitForCount(25);
    const calls = gateway.batchCalls;
    first.unmount();

    renderProbe(gateway);
    await waitForCount(25);
    expect(gateway.batchCalls).toBe(calls);
  });

  it('re-reads only the changed file when the tree changes', async () => {
    const gateway = new CountingGateway(buildSeed(25));
    renderProbe(gateway);
    await waitForCount(25);

    const target = 'src/content/blog/post/00.md';
    const current = await gateway.readFile(target);
    await gateway.writeFile({
      path: target,
      text: `---\ntitle: '已更新'\ndate: '2026-12-01'\n---\nnew body\n`,
      message: 'test: touch',
      branch: 'main',
      sha: current.sha,
    });

    const before = gateway.batchCalls;
    await userEvent.click(screen.getByRole('button', { name: 'check' }));
    await waitFor(() => expect(screen.getByTestId('titles').textContent).toContain('已更新'));
    // One delta batch containing exactly the changed blob.
    expect(gateway.batchCalls).toBe(before + 1);
  });

  it('drops a deleted post without reading a blob', async () => {
    const gateway = new CountingGateway(buildSeed(25));
    renderProbe(gateway);
    await waitForCount(25);

    const target = 'src/content/blog/post/00.md';
    const current = await gateway.readFile(target);
    await gateway.deleteFile({ path: target, message: 'test: delete', branch: 'main', sha: current.sha });

    const before = gateway.batchCalls;
    await userEvent.click(screen.getByRole('button', { name: 'check' }));
    await waitForCount(24);
    expect(gateway.batchCalls).toBe(before);
    expect(screen.getByTestId('titles').textContent).not.toContain('T0');
  });

  it('reports a pending check while the tree refetch is in flight', async () => {
    const gateway = new SlowTreeGateway(buildSeed(5));
    renderProbe(gateway);
    await waitForCount(5);

    gateway.delayMs = 200;
    await userEvent.click(screen.getByRole('button', { name: 'check' }));
    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('true'));
    expect(screen.getByTestId('busy').textContent).toBe('true');
    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('false'), { timeout: 3000 });
  });
});
