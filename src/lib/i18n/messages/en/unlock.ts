import type { UnlockMessages } from '../zh-CN/unlock';

const unlock: UnlockMessages = {
  seal: 'Sakura',
  title: 'Welcome back',
  modeDescription: {
    device: 'The vault is still on this device. Unsealing with the fingerprint.',
    password: 'The vault is still on this device. Enter the password to unseal it.',
    twoFactor: 'Two-factor is on: the password plus the same device fingerprint as when set up. Both must match to unseal.',
    legacyMixed:
      'This is a legacy vault: either the password or the device fingerprint unlocks it. Consider upgrading to two-factor in Settings.',
    unknown: 'The vault record is incomplete, so the unlock method cannot be determined. Reset it and re-enter the PAT.',
  },
  password: {
    label: 'password',
    aria: 'Password',
  },
  submit: {
    idle: 'Unseal',
    busy: 'Verifying…',
  },
  deviceUnlock: {
    idle: 'Unlock with device fingerprint',
    busy: 'Verifying device…',
  },
  legacyDeviceUnlock: 'Legacy: unlock with device fingerprint',
  twoFactorNote:
    'Two-factor needs the fingerprint of the same device. After changing devices, or if the fingerprint changes, there is no recovery — the vault must be reset, and local backups for live repositories are cleared too.',
  footer: {
    line1: 'Tokens decrypt only on this device · locking clears memory and caches',
    line2: 'Forgot password = re-enter the PAT',
  },
  reset: 'Reset vault',
  resetConfirm: {
    message:
      'Resetting the vault deletes all repository PATs and the repository list on this device, and clears all local unsaved backups, drafts, and post caches for live repositories. The current content/fields/commit template are kept as defaults for the next setup. You will need to re-enter the PATs. Continue?',
    description: 'Posts on GitHub are unaffected; local content that was never committed cannot be recovered.',
  },
  aside: {
    device: {
      title: 'Device binding',
      body: 'The fingerprint is computed locally and never sent to any server.',
    },
    twoFactor: {
      title: 'Two-factor is AND',
      body: 'The password and fingerprint must both match — it is not either/or.',
    },
    readOnly: {
      title: 'Read-only, still safe',
      body: 'A read-only token never shows any write actions.',
    },
  },
  demo: 'Try the demo first',
  modePicker: {
    legend: 'Unlock method',
    twoFactorWarning:
      'Both the password and this device fingerprint are required. After changing devices, clearing browser data, or if the fingerprint changes, unlocking becomes impossible — the only option is to reset the vault and re-enter the PAT, which also clears unsaved backups for live repositories on this device.',
  },
};

export default unlock;
