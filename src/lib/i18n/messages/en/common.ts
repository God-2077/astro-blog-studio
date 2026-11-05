import type { CommonMessages } from '../zh-CN/common';

const common: CommonMessages = {
  language: 'Interface language',
  confirm: 'Confirm',
  cancel: 'Cancel',
  save: 'Save',
  close: 'Close',
  back: 'Back',
  retry: 'Retry',
  loading: 'Loading',
  loadingEditor: 'Loading editor',
  copy: 'Copy',
  copied: 'Copied',
  delete: 'Delete',
  edit: 'Edit',
  add: 'Add',
  remove: 'Remove',
  open: 'Open',
  closeToast: 'Dismiss notification',
  themeLabel: 'Theme',
  theme: {
    system: { label: 'Follow system', hint: 'Follows system light/dark changes automatically' },
    day: { label: 'Day', hint: 'Warm paper daytime desk' },
    night: { label: 'Night', hint: 'Warm ink on night paper, not a pure-black inversion' },
  },
  vaultMode: {
    device: {
      label: 'Device fingerprint',
      hint: 'Unlocks automatically on this device, even after refresh; not recommended on shared computers.',
      autoLabel: 'Unlock with device fingerprint',
    },
    password: { label: 'Password', hint: 'Enter the password in each new tab; not tied to a device, so it works anywhere.' },
    twoFactor: {
      label: 'Password + device two-factor',
      hint: 'The password and the fingerprint of this device must both match; if either is lost, the vault can only be reset.',
    },
    legacy: 'Legacy: password or device fingerprint',
    none: 'Not configured',
  },
  fieldHint: {
    description: 'SEO / list excerpt',
    link: 'Custom URL slug',
    cover: 'Cover image path',
    categories: 'Use > to nest categories',
    hideFrom: 'home / home_rss / rss / all',
  },
  noDate: 'No date',
  untitled: 'Untitled',
  units: {
    words: { one: '{count} chars', other: '{count} chars' },
    readingTime: { one: '{count} min', other: '{count} min' },
  },
  passwordMinLength: { one: 'At least {count} characters', other: 'At least {count} characters' },
  appDescription:
    'A browser-based, frontend-only Markdown blog studio: it reads and writes your content repository directly through the GitHub API, with no backend server — the token is only ever stored encrypted on this device.',
};

export default common;
