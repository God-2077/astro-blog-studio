import type { SetupMessages } from '../zh-CN/setup';

const setup: SetupMessages = {
  eyebrow: 'first run',
  title: 'Connect your repository',
  intro:
    'Your token is stored encrypted only on this device. Once configured, the Studio reads and writes the Markdown in your repository directly. You can add more repositories later in Settings — each with its own PAT, all sharing one unlock method.',
  badge: '01 Sakura Journal',
  pat: {
    label: 'GitHub PAT',
    hint: 'Fine-grained: Contents read/write + Metadata read',
  },
  repo: {
    label: 'Repository',
    hint: 'owner/repository or a GitHub URL',
  },
  branch: {
    label: 'Branch',
    hint: 'Leave empty to use the default branch',
  },
  rootDir: {
    label: 'Posts root directory',
  },
  excludes: {
    label: 'Exclusion rules',
    hint: 'One per line; prefix or glob',
  },
  unlockMode: {
    title: 'Unlock method',
    password: {
      label: 'Password',
      hint: 'At least {count} characters; if forgotten, the only option is to reset the vault and re-enter the PAT',
      placeholder: 'Set a password',
    },
  },
  error: {
    tokenRequired: 'Paste a GitHub PAT first.',
    repoInvalid: 'Repositories must be owner/repository or a full GitHub URL.',
    passwordTooShort: 'The password must be at least {count} characters.',
  },
  submit: {
    idle: 'Connect repository',
    busy: 'Validating and encrypting…',
  },
  demo: 'Try the demo first',
  createToken: 'Create a fine-grained token ↗',
  storage: {
    title: 'How tokens are stored',
    body: 'Each repository’s PAT is wrapped in AES-GCM under one shared data key, which is itself wrapped by a key derived from the device fingerprint or password via PBKDF2. With two-factor, both the password and the fingerprint feed the derivation, and neither alone is enough. Tokens exist only as ciphertext in localStorage and never enter a network request before unlock.',
    note: 'The device fingerprint is not a secret; the password is the real security boundary. After changing devices or fingerprints, two-factor can only be recovered by resetting the vault.',
  },
  blog: {
    title: 'Their blog, meow~',
    intro: 'Want to sneak a peek at their blog, meow~ ',
    hint: 'Tap blog.ksable.top and have a look (｡･ω･｡)ﾉ♡',
  },
};

export default setup;
