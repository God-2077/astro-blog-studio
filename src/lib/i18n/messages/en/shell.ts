import type { ShellMessages } from '../zh-CN/shell';

const shell: ShellMessages = {
  nav: {
    toggleSidebar: { open: 'Open file index', close: 'Collapse file index' },
    closeSidebar: 'Close file index',
    home: 'Back to Studio',
    newPost: 'New',
    settings: 'Settings',
    lock: 'Lock',
    githubRepo: 'Open repository on GitHub',
    update: { aria: 'A new version is available; view the update prompt', title: 'New version' },
    projectSource: 'Open project source on GitHub',
  },
  demo: {
    badge: 'Demo mode',
    banner:
      'Demo mode: the sample repository lives only in memory and never connects to GitHub; unsaved drafts use the local demo key. Refreshing restores the initial samples.',
    settings: 'View settings',
    exit: 'Exit demo / connect a live repository',
  },
  footer: {
    demoMode: 'in-memory fixture',
    liveMode: 'github.com · content repo',
    cached: { one: 'Cached {count} posts', other: 'Cached {count} posts' },
  },
  leave: {
    title: 'The current post has unsaved changes. Leave anyway?',
    confirm: 'Leave',
    cancel: 'Keep editing',
  },
  tree: {
    title: 'Index',
    count: { one: '{count} posts', other: '{count} posts' },
    refresh: 'Check for updates',
    refreshBusy: 'Checking for updates',
    refreshHint: 'Check for updates (file tree + posts)',
    searchPlaceholder: 'Search files / paths',
    searchLabel: 'Search files',
    empty: 'No Markdown files found.',
    emptyHint: 'Check the root directory and exclusion rules.',
    noMatch: 'No files match “{query}”.',
    excluded: 'Excluded {count}',
    rules: 'Rules',
  },
  newPost: {
    eyebrow: 'new draft',
    title: 'New post',
    description:
      'Draft locally first; stamping makes a single commit, and opening the editor writes nothing to the repository.',
    titleLabel: 'Title',
    titlePlaceholder: 'e.g. Note: today’s grammar memo',
    dirLabel: 'Directory',
    dirHint: 'Choose or type a path inside the blog root',
    filenameLabel: 'Filename',
    filenameHint: 'Defaults to the title when empty; no extension gets .md, other suffixes are kept with a warning',
    filenameHintRequired: 'Required; no extension gets .md, other suffixes are kept with a warning',
    filenameExtensionHint: 'The suffix {suffix} is not .md / .mdx; {name} will be created as plain text',
    preview: 'Will be created · committed on save',
    commitMessage: 'Commit message:',
    start: 'Start drafting',
    parking: 'Saving to Drafts…',
    errors: {
      titleRequired: 'The title cannot be empty',
      filenameRequired: 'The filename cannot be empty',
      filenameSeparator: 'The filename cannot contain / or backslashes; put the directory in the Directory field',
      filenameControl: 'The filename cannot contain control characters',
      filenameIllegalChars: 'The filename cannot contain these characters: {chars}',
      filenameReserved: '“{name}” is a reserved system name; choose another filename',
      filenameTrailingDot: 'The filename cannot end with a dot (.)',
      pathTaken: 'A file already exists at this path',
      parkFailed:
        'The previous new draft could not be saved to Drafts. Free up local storage, or return to that draft and handle it before trying again.',
    },
  },
};

export default shell;
