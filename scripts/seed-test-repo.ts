import { createTestOctokit, decodeBase64, encodeBase64, readTestEnv, redact, seedFiles } from './lib/test-env';

async function main(): Promise<void> {
  const env = readTestEnv();
  if (!env) {
    process.exitCode = 1;
    return;
  }
  const octokit = createTestOctokit(env.token);
  const { owner, name, branch } = env;

  const repo = await octokit.repos.get({ owner, repo: name });
  console.log(`repo: ${owner}/${name} · default branch ${repo.data.default_branch}`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of seedFiles) {
    let sha: string | undefined;
    try {
      const existing = await octokit.repos.getContent({ owner, repo: name, path: file.path, ref: branch });
      if (!Array.isArray(existing.data) && existing.data.type === 'file') {
        sha = existing.data.sha;
        if (existing.data.content && decodeBase64(existing.data.content) === file.text) {
          skipped += 1;
          continue;
        }
      }
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 404) throw error;
    }

    try {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo: name,
        path: file.path,
        message: sha ? `test: update ${file.path}` : `test: seed ${file.path}`,
        content: encodeBase64(file.text),
        branch,
        ...(sha ? { sha } : {}),
      });
      if (sha) updated += 1;
      else created += 1;
      console.log(`${sha ? 'updated' : 'created'} ${file.path}`);
    } catch (error) {
      throw new Error(`seed failed for ${file.path}: ${redact(error)}`);
    }
  }

  console.log(`seed done · created ${created}, updated ${updated}, skipped ${skipped}`);
}

main().catch((error) => {
  console.error(redact(error));
  process.exitCode = 1;
});
