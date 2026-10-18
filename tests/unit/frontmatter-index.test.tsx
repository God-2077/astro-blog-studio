// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFrontmatterIndex, useTreeModel } from '@/hooks/use-data';
import { defaultSettings } from '@/lib/config/defaults';
import { demoContentConfig, demoRepo } from '@/lib/demo/fixtures';
import { GatewayProvider } from '@/lib/gateway/context';
import { FixtureGateway } from '@/lib/github/fixture';
import type { FileContent } from '@/lib/github/types';
import { pickRecent } from '@/lib/posts/summary';
import { useSettings } from '@/stores/settings';

afterEach(() => {
  cleanup();
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

class FlakyGateway extends CountingGateway {
  failNext = true;

  override async readFiles(paths: string[]): Promise<FileContent[]> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('batch down');
    }
    return super.readFiles(paths);
  }
}

class ConcurrencyGateway extends CountingGateway {
  active = 0;
  peak = 0;

  override async readFiles(paths: string[]): Promise<FileContent[]> {
    this.active += 1;
    this.peak = Math.max(this.peak, this.active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return await super.readFiles(paths);
    } finally {
      this.active -= 1;
    }
  }
}

function Probe() {
  const { tree, model } = useTreeModel();
  const files = useMemo(() => model?.files ?? [], [model]);
  const index = useFrontmatterIndex(files, tree.data?.sha);
  const recent = pickRecent(index.summaries, 12);
  return (
    <div>
      <span data-testid="scanned">{index.scanned}</span>
      <span data-testid="total">{index.total}</span>
      <span data-testid="indexing">{String(index.isIndexing)}</span>
      <span data-testid="failed">{String(index.failedChunks)}</span>
      <span data-testid="recent">{recent.map((post) => post.title).join('|')}</span>
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

describe('useFrontmatterIndex', () => {
  it('indexes every visible file and sorts the whole corpus before slicing', async () => {
    const gateway = new CountingGateway(buildSeed(25));
    renderProbe(gateway);

    await waitFor(() => expect(screen.getByTestId('scanned').textContent).toBe('25'));

    expect(screen.getByTestId('total').textContent).toBe('25');
    expect(screen.getByTestId('indexing').textContent).toBe('false');
    // 25 files / 20 per batch
    expect(gateway.batchCalls).toBe(2);
    // Date order matches path order here, so the newest twelve are the last ten
    // files of the first batch plus the second batch. A 12-file path slice would
    // have produced T0..T11 instead.
    expect(screen.getByTestId('recent').textContent?.split('|')[0]).toBe('T24');
  });

  it('reuses the file cache when summaries refetch', async () => {
    const gateway = new CountingGateway(buildSeed(25));
    const { client } = renderProbe(gateway);

    await waitFor(() => expect(screen.getByTestId('scanned').textContent).toBe('25'));
    const before = gateway.batchCalls;

    await client.refetchQueries({ queryKey: ['summaries'] });
    expect(gateway.batchCalls).toBe(before);
  });

  it('re-reads only the changed file after the tree changes', async () => {
    const gateway = new CountingGateway(buildSeed(25));
    const { client } = renderProbe(gateway);
    await waitFor(() => expect(screen.getByTestId('scanned').textContent).toBe('25'));

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
    await client.refetchQueries({ queryKey: ['tree'] });
    await waitFor(() => expect(screen.getByTestId('recent').textContent?.split('|')[0]).toBe('已更新'));
    // Only the batch containing the changed blob hits the gateway, and only for
    // that one blob: the other 19 files are served from the ['file'] cache.
    expect(gateway.batchCalls).toBe(before + 1);
  });

  it('honours the configured index concurrency', async () => {
    useSettings.setState({ content: { ...defaultSettings.content, indexConcurrency: 2 } });
    const gateway = new ConcurrencyGateway(buildSeed(140));
    renderProbe(gateway);

    await waitFor(() => expect(screen.getByTestId('scanned').textContent).toBe('140'), { timeout: 10_000 });
    expect(gateway.batchCalls).toBe(7);
    expect(gateway.peak).toBe(2);
  });

  it('keeps the other batches when one batch fails, then recovers on retry', async () => {
    const gateway = new FlakyGateway(buildSeed(25));
    const { client } = renderProbe(gateway);

    await waitFor(() => expect(screen.getByTestId('failed').textContent).toBe('1'));
    expect(screen.getByTestId('scanned').textContent).toBe('5');

    await client.refetchQueries({ queryKey: ['summaries'] });
    await waitFor(() => expect(screen.getByTestId('scanned').textContent).toBe('25'));
    expect(screen.getByTestId('failed').textContent).toBe('0');
    expect(screen.getByTestId('recent').textContent?.split('|')[0]).toBe('T24');
  });
});
