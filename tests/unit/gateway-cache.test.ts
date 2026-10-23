import { describe, expect, it } from 'vitest';
import { LiveGateway } from '@/lib/github/live';

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function mockJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function createGateway(fetchImpl: typeof fetch): LiveGateway {
  return new LiveGateway({
    token: 'test-token',
    owner: 'God-2077',
    name: 'astro-blog-content-test',
    branch: 'main',
    fetchImpl,
  });
}

/**
 * GitHub answers API requests with `Cache-Control: max-age=60`; the gateway
 * must opt out so a refetch after a commit cannot be served from the browser
 * HTTP cache.
 */
describe('LiveGateway HTTP cache policy', () => {
  it('sends Octokit tree reads with cache no-store', async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return mockJson({
        sha: 'tree-sha',
        truncated: false,
        tree: [{ type: 'blob', path: 'src/a.md', sha: 'blob-sha', size: 18 }],
      });
    }) as typeof fetch;

    const tree = await createGateway(fetchImpl).getTree();

    expect(tree).toEqual({ sha: 'tree-sha', truncated: false, entries: [{ path: 'src/a.md', sha: 'blob-sha', size: 18 }] });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.cache).toBe('no-store');
    expect(calls[0]?.init?.method).toBe('GET');
  });

  it('sends Octokit Contents reads with cache no-store', async () => {
    const calls: FetchCall[] = [];
    const text = '---\ntitle: A\n---\n';
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return mockJson({
        type: 'file',
        encoding: 'base64',
        size: text.length,
        sha: 'file-sha',
        name: 'a.md',
        path: 'src/a.md',
        content: Buffer.from(text, 'utf8').toString('base64'),
      });
    }) as typeof fetch;

    const file = await createGateway(fetchImpl).readFile('src/a.md');

    expect(file).toEqual({ path: 'src/a.md', text, sha: 'file-sha', size: text.length });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.cache).toBe('no-store');
  });

  it('sends GraphQL batch reads with cache no-store', async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return mockJson({
        data: {
          repository: {
            f0: { oid: 'sha-a', byteSize: 18, text: '---\ntitle: A\n---\n' },
          },
        },
      });
    }) as typeof fetch;

    const files = await createGateway(fetchImpl).readFiles(['src/a.md']);

    expect(files).toEqual([{ path: 'src/a.md', text: '---\ntitle: A\n---\n', sha: 'sha-a', size: 18 }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.github.com/graphql');
    expect(calls[0]?.init?.cache).toBe('no-store');
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('authorization')).toBe('Bearer test-token');
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      variables: expect.objectContaining({ e0: 'main:src/a.md' }),
    });
  });
});
