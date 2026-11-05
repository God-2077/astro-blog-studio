import type { DialogsMessages } from '../zh-CN/dialogs';

const dialogs: DialogsMessages = {
  addRepo: {
    title: 'Add repository',
    description:
      'Each repository stores its own PAT, but all share the same vault and unlock method. You will switch to the new repository right after adding it.',
    repo: 'Repository',
    repoHint: 'owner/repository or a GitHub URL',
    branch: 'Branch',
    branchHint: 'Leave empty to use the default branch',
    pat: 'PAT',
    patHint: 'Leave empty if a token for this repository already exists',
    rootDir: 'Root directory',
    rootDirHint: 'Relative to the repository root',
    excludes: 'Exclusion rules',
    excludesHint: 'One per line; prefix or glob',
    note: 'The new repository starts with the current extensions, time zone, index concurrency, frontmatter fields, and commit template; after that, each repository keeps its own configuration.',
    repoRequired: 'Enter a repository first.',
    submit: 'Validate and add',
    busy: 'Validating and adding…',
    patFooter: 'The PAT is written to the local vault as ciphertext only; it never appears in logs or URLs.',
  },
  repoToken: {
    title: 'Update repository token',
    description: 'The new PAT is encrypted into the same vault; other branches of this repository will use it too.',
    label: 'New GitHub PAT',
    hint: 'Access to this repository is validated first',
    submit: 'Validate and update',
    busy: 'Validating and saving…',
  },
  missingToken: {
    title: 'No usable token for this repository yet',
    descriptionBefore: 'The PAT for the current repository',
    descriptionAfter:
      'is not in the vault. Enter it again and it will be stored encrypted in the same vault without affecting other repositories.',
    label: 'GitHub PAT',
    hint: 'Stored only in the local vault',
    submit: 'Save this repository’s token',
    busy: 'Validating and saving…',
    lock: 'After locking, reset the vault from the unlock screen',
  },
};

export default dialogs;
