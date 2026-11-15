import type { DialogsMessages } from '../zh-CN/dialogs';

const dialogs: DialogsMessages = {
  addRepo: {
    title: 'Add repository',
    description:
      'Each repository stores its own PAT, but all share the same vault and unlock method. You will switch to the new repository right after adding it.',
    repo: 'Repository',
    repoHint: 'owner/repository or a GitHub URL',
    kind: 'Repository type',
    presetNote: 'Switching type applies its root directory and exclusion rules; you can still edit them by hand.',
    branch: 'Branch',
    branchHint: 'Leave empty to use the default branch',
    pat: 'PAT',
    patHint: 'Leave empty if a token for this repository already exists',
    rootDir: 'Root directory',
    rootDirHint: 'Relative to the repository root',
    daybookRootHint: 'Daybook usually leaves this empty (repository root)',
    repoRootPlaceholder: 'Repository root (empty)',
    excludes: 'Exclusion rules',
    excludesHint: 'One per line; prefix or glob',
    note: 'The new repository inherits the current time zone, index concurrency, and commit template. Root directory, exclusions, and frontmatter fields are prefilled from the selected type, then saved per repository.',
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
