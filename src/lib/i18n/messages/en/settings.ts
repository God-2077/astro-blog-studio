import type { SettingsMessages } from '../zh-CN/settings';

const settings: SettingsMessages = {
  mode: {
    demo: 'Demo mode',
    live: 'Live repository',
  },
  header: {
    title: 'Settings',
    backToDashboard: 'Back to Studio',
    saving: 'Saving…',
    save: 'Save settings',
  },
  repos: {
    title: 'Repositories',
    meta: { one: '{count} · independent PATs', other: '{count} · independent PATs' },
    intro:
      'All repositories share one vault and one unlock method, so switching never asks for the password again. Each repository has its own PAT, and its content and exclusion rules, frontmatter fields, and commit message are stored per repository. Switching only clears in-memory views; it does not delete local encrypted caches or drafts.',
    add: 'Add repository',
    current: 'Current',
    missingPat: 'Missing PAT',
    switch: 'Switch',
    tokenMissingHint: 'Update this repository’s token first',
    updateToken: 'Update token',
    remove: 'Remove',
  },
  content: {
    title: 'Content & exclusions',
    demoNote:
      'Demo mode uses a fixed sample repository and exclusion rules; these fields apply once a live repository is connected.',
    rootDir: 'Root directory',
    rootDirHint: 'Relative to the repository root',
    extensions: 'File extensions',
    extensionsHint: 'Comma separated',
    timezone: 'Time zone',
    timezoneHint: 'Used for the date template and updated',
    visible: 'Currently visible',
    visibleHint: 'From the file tree',
    demoData: 'Sample data',
    seeTree: 'See file tree',
    indexConcurrency: 'Index concurrency',
    indexConcurrencyHint:
      '{min}–{max}, default {default}. Number of concurrent 20-post batches during the first full read and incremental sync. Higher is faster, but too high may trigger GitHub rate limits.',
    excludes: 'Exclusion rules',
    excludesHint: 'One per line; prefix or glob',
  },
  cache: {
    title: 'Local post cache',
    demoMeta: 'Demo mode · memory only',
    meta: { one: '{count} posts · AES-GCM', other: '{count} posts · AES-GCM' },
    intro:
      'The first visit reads the whole repository once and stores the posts encrypted in local IndexedDB. After that, each visit fetches only the file tree, compares paths and blob SHAs, re-reads only added or modified posts, and removes deleted ones from the cache.',
    cached: { one: 'Cached {count} posts', other: 'Cached {count} posts' },
    lastSynced: 'Last synced {value}',
    neverSynced: 'Not synced yet',
    tree: 'Tree {value}',
    phaseReadingFull: 'Reading all posts…',
    phaseReadingCache: 'Reading local cache…',
    phaseSyncing: 'Syncing post changes…',
    phaseChecking: 'Checking for remote updates…',
    persistFailed:
      'Could not write the local cache (possibly out of space). You can keep browsing this session; reopening the site will read everything again.',
    checkUpdates: 'Check for updates',
    checking: 'Checking…',
    forceFull: 'Force full refresh',
    demoFooter: 'The demo repository exists only in memory; demo mode never writes the local cache.',
    liveFooter:
      'Live repositories are encrypted with a subkey derived from the vault data key. The cache becomes unreadable when locked and is cleared when the vault is reset.',
  },
  frontmatter: {
    title: 'Frontmatter fields',
    meta: { one: '{count} fields', other: '{count} fields' },
    invalid: 'Invalid',
    intro:
      'Defines the editor fields, types, and required validation. Removing a field does not remove its keys from existing files, and unconfigured fields are kept as-is.',
  },
  fields: {
    required: 'Required',
    nameAria: 'Field {index} name',
    typeAria: 'Field {name} type',
    removeAria: 'Remove field {name}',
    removeTitle: 'Remove field',
    add: 'Add field',
    reset: 'Restore common fields',
    limit: '{count} / 40',
    hint: 'Names may contain letters, digits, underscores, and hyphens. title / date are required by the astro-blog schema; content saved after removing them may fail to build. Unconfigured fields in existing files are kept as-is.',
  },
  commit: {
    title: 'Commit message',
    hint: 'Available: {placeholders}; unknown placeholders are kept as-is.',
    confirmBefore: 'Ask for commit confirmation before saving',
  },
  editor: {
    title: 'Editing & preview',
    fontSize: 'Body font size',
    showLineNumbers: 'Show line numbers',
    updateUpdatedAt: 'Update updated on save',
    previewHint:
      'Preview supports GFM, code, math, spoilers, ruby, and ::: containers; raw HTML is sanitized and link cards fall back to plain links.',
    backupUnsaved: 'Back up unsaved changes',
    backupHint:
      'Backups for live repositories are encrypted with the vault key and written to local IndexedDB; they can only be restored after unlocking. Demo mode is not encrypted. Entering the editor checks for backups and prompts to restore.',
    clearingBackups: 'Clearing…',
    clearBackups: 'Clear local backups for this repository',
  },
  appearance: {
    title: 'Appearance',
    meta: 'Applies instantly · currently {theme}',
    intro:
      'Follows the system by default; a manual choice is remembered. Night mode uses warm ink paper and cream ink — it is not an inverted light theme.',
  },
  security: {
    title: 'Security',
    encrypted: 'Stored encrypted',
    tokens: 'Tokens: {value}',
    demoNoToken: 'No token in demo mode',
    tokensEncrypted: 'Each repository is encrypted separately',
    currentMode: 'Current unlock method:',
    autoLock: 'Auto-lock (minutes, 0 to disable)',
    legacyWarning:
      'This is the legacy “password or fingerprint” mode. Pick one method and update; it becomes either strict two-factor or a single method, and the device wrapper is removed.',
    newPassword: 'New password',
    newPasswordHint: 'At least {min} characters; the old password is not required',
    newPasswordPlaceholder: 'Enter a new password',
    updating: 'Updating…',
    updateUnlock: 'Update unlock method',
    updateNote: 'Takes effect immediately and is stored in the local vault; existing encrypted unsaved backups remain valid.',
    lockNow: 'Lock now',
    resetVault: 'Reset vault',
    footer:
      'With two-factor, a forgotten password or a changed fingerprint cannot be recovered — the only option is to reset the vault and re-enter the PAT. Local unsaved backups for live repositories are cleared too.',
  },
  config: {
    title: 'Current configuration',
    excludes: { one: '{count} exclusions', other: '{count} exclusions' },
    demoNote:
      'Demo repository content lives only in memory; unsaved backups are stored under the local demo key (unencrypted).',
    liveNote: 'Backups are encrypted, written only to local IndexedDB, and never uploaded.',
  },
  confirm: {
    discardDescription:
      'Switching or adding a repository does not save changes on the current Settings page; choosing “Continue” discards those unsaved changes.',
    continueLabel: 'Continue',
    keepEditing: 'Keep editing',
    addRepoDiscard: 'Unsaved Settings changes will be discarded before adding and switching repositories.',
    switchDiscard: 'Unsaved Settings changes will be discarded before switching to {repo}.',
    clearBackupsTitle: 'Clear unsaved backups for this repository on this device? This cannot be undone.',
    clearBackupsDescription:
      'Only local backups for the current repository and branch are cleared; files on GitHub are untouched. Content being edited will be written again.',
    clearBackupsConfirm: 'Clear backups',
    forceFullTitle: 'A forced full refresh clears the local post cache for this repository and re-reads every post. Continue?',
    forceFullDescription:
      'Re-reads with the current index concurrency; it only affects the cache on this device and does not change files on GitHub.',
    forceFullConfirm: 'Re-read',
    removeTitle: 'Remove repository “{repo}” from this device?',
    removeDescription:
      'This deletes the repository PAT from the vault (kept if other branches of the same repository still use it) and removes its repository-level configuration. Local encrypted post caches, drafts, and backups are not deleted immediately; resetting the vault clears them all.',
    removeConfirm: 'Remove repository',
    resetVaultTitle:
      'Resetting the vault deletes all repository PATs and the repository list on this device, and clears all local unsaved backups, drafts, and post caches for live repositories. The current content/fields/commit template are kept as defaults for the next setup. You will need to re-enter the PATs. Continue?',
    resetVaultDescription: 'Posts on GitHub are unaffected; local content that was never committed cannot be recovered.',
    resetVaultConfirm: 'Reset vault',
    resetFieldsTitle: 'Restore the common hello-world fields? The current field list will be replaced.',
    resetFieldsDescription: 'Other frontmatter keys in saved posts are not removed; the editor keeps them as unknown fields.',
    resetFieldsConfirm: 'Restore defaults',
  },
  toast: {
    saved: 'Settings saved',
    fieldInvalid: 'Frontmatter fields are invalid. Fix them first',
    unlockUpdated: 'Unlock method updated: {mode}',
    clearBackupsDone: 'Cleared local backups for this repository',
    clearBackupsFailed: 'Clear failed. Try again later',
    demoNoCache: 'Demo mode does not write the local cache',
    switched: 'Switched to {repo}',
    addedAndSwitched: 'Repository added and switched',
    tokenUpdated: 'Updated the token for {repo}',
    removed: 'Repository removed',
  },
};

export default settings;
