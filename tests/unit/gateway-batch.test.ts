import { describe, expect, it } from 'vitest';
import { LiveGateway } from '@/lib/github/live';
import type { RateLimitInfo } from '@/lib/github/types';

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function mockJson(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function createGateway(fetchImpl: typeof fetch, onRateLimit?: (info: RateLimitInfo) => void): LiveGateway {
  return new LiveGateway({
    token: 'test-token',
    owner: 'God-2077',
    name: 'astro-blog-content-test',
    branch: 'main',
    fetchImpl,
    onRateLimit,
  });
}

describe('LiveGateway.readFiles batch', () => {
  it('reads multiple blobs in one GraphQL request, including CJK paths', async () => {
    const calls: FetchCall[] = [];
    const rates: RateLimitInfo[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return mockJson(
        {
          data: {
            repository: {
              f0: { oid: 'sha-a', byteSize: 18, text: '---\ntitle: A\n---\n' },
              f1: { oid: 'sha-b', byteSize: 26, text: '---\ntitle: 便笺\n---\n' },
              f2: null,
            },
          },
        },
        {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4998',
          'x-ratelimit-reset': '1700000000',
        },
      );
    }) as typeof fetch;

    const gateway = createGateway(fetchImpl, (info) => rates.push(info));
    const files = await gateway.readFiles(['src/a.md', 'src/content/blog/note/便笺 测试.md', 'src/missing.md']);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.github.com/graphql');
    const payload = JSON.parse(String(calls[0]?.init?.body)) as {
      query: string;
      variables: Record<string, string>;
    };
    expect(payload.query).toContain('f0: object');
    expect(payload.variables.e0).toBe('main:src/a.md');
    expect(payload.variables.e1).toBe('main:src/content/blog/note/便笺 测试.md');
    expect(files).toEqual([
      { path: 'src/a.md', text: '---\ntitle: A\n---\n', sha: 'sha-a', size: 18 },
      { path: 'src/content/blog/note/便笺 测试.md', text: '---\ntitle: 便笺\n---\n', sha: 'sha-b', size: 26 },
    ]);
    expect(rates[0]).toMatchObject({ limit: 5000, remaining: 4998 });
  });

  it('skips oversized and binary blobs', async () => {
    const fetchImpl = (async () =>
      mockJson({
        data: {
          repository: {
            f0: { oid: 'sha-ok', byteSize: 5, text: 'hello' },
            f1: { oid: 'sha-big', byteSize: 1_000_000, text: 'big' },
            f2: { oid: 'sha-binary', byteSize: 5, text: null },
          },
        },
      })) as typeof fetch;
    const gateway = createGateway(fetchImpl);
    const files = await gateway.readFiles(['a.md', 'big.md', 'binary.bin']);
    expect(files).toEqual([{ path: 'a.md', text: 'hello', sha: 'sha-ok', size: 5 }]);
  });

  it('falls back to the Contents API once and remembers the failure', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/graphql')) {
        return mockJson({ errors: [{ message: 'GraphQL is not available' }] });
      }
      if (url.includes('/contents/')) {
        const text = '---\ntitle: Fallback\n---\n';
        return mockJson({
          type: 'file',
          encoding: 'base64',
          size: text.length,
          sha: 'rest-sha',
          name: 'a.md',
          path: 'src/a.md',
          content: Buffer.from(text, 'utf8').toString('base64'),
        });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const gateway = createGateway(fetchImpl);
    const first = await gateway.readFiles(['src/a.md']);
    expect(first).toHaveLength(1);
    expect(first[0]?.sha).toBe('rest-sha');
    expect(first[0]?.text).toContain('Fallback');
    expect(calls.filter((url) => url.endsWith('/graphql'))).toHaveLength(1);

    const second = await gateway.readFiles(['src/a.md']);
    expect(second).toHaveLength(1);
    expect(calls.filter((url) => url.endsWith('/graphql'))).toHaveLength(1);
  });
});
