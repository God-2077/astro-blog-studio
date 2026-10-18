import { createTestOctokit, readTestEnv, redact } from './lib/test-env';

const E2E_PREFIXES = ['src/_e2e/', '_e2e/'];

async function main(): Promise<void> {
  const env = readTestEnv();
  if (!env) {
    process.exitCode = 1;
    return;
  }
  const octokit = createTestOctokit(env.token);
  const { owner, name, branch } = env;

  const ref = await octokit.request('GET /repos/{owner}/{repo}/git/ref/heads/{branch}', { owner, repo: name, branch });
  const commit = await octokit.request('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
    owner,
    repo: name,
    commit_sha: ref.data.object.sha,
  });
  const tree = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
    owner,
    repo: name,
    tree_sha: commit.data.tree.sha,
    recursive: '1',
  });
  const targets = tree.data.tree.filter(
    (item) => item.type === 'blob' && item.path && E2E_PREFIXES.some((prefix) => item.path?.startsWith(prefix)),
  );
  if (targets.length === 0) {
    console.log('nothing to clean under src/_e2e');
    return;
  }

  let deleted = 0;
  for (const target of targets) {
    if (!target.path || !target.sha) continue;
    const content = await octokit.repos.getContent({ owner, repo: name, path: target.path, ref: branch });
    if (Array.isArray(content.data) || content.data.type !== 'file') continue;
    await octokit.repos.deleteFile({
      owner,
      repo: name,
      path: target.path,
      message: `test: clean ${target.path}`,
      sha: content.data.sha,
      branch,
    });
    deleted += 1;
  }
  console.log(`cleanup done · deleted ${deleted} file(s)`);
}

main().catch((error) => {
  console.error(redact(error));
  process.exitCode = 1;
});
