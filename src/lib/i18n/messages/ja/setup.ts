import type { SetupMessages } from '../zh-CN/setup';

const setup: SetupMessages = {
  eyebrow: 'first run',
  title: 'リポジトリをつなぐ',
  intro:
    'トークンはこのデバイスに暗号化して保存されるだけです。設定が終わると、このワークスペースはリポジトリ内の Markdown を直接読み書きします。あとから設定でリポジトリを追加でき、それぞれ独自の PAT を使い、ロック解除方法は共通です。',
  badge: '01 桜飴手帳',
  pat: {
    label: 'GitHub PAT',
    hint: 'Fine-grained: Contents の読み書き + Metadata の読み取り',
  },
  repo: {
    label: 'リポジトリ',
    hint: 'owner/repository または GitHub URL',
  },
  branch: {
    label: 'ブランチ',
    hint: '空欄の場合はリポジトリの既定ブランチを使用',
  },
  rootDir: {
    label: '記事のルートディレクトリ',
  },
  excludes: {
    label: '除外ルール',
    hint: '1 行に 1 件。プレフィックスまたは glob',
  },
  unlockMode: {
    title: 'ロック解除方法',
    password: {
      label: 'パスワード',
      hint: '少なくとも {count} 文字。忘れると保管庫をリセットして PAT を再入力するしかありません',
      placeholder: 'パスワードを設定',
    },
  },
  error: {
    tokenRequired: '先に GitHub PAT を貼り付けてください。',
    repoInvalid: 'リポジトリの形式は owner/repository か、完全な GitHub URL にしてください。',
    passwordTooShort: 'パスワードは少なくとも {count} 文字必要です。',
  },
  submit: {
    idle: 'リポジトリに接続',
    busy: '検証して暗号化中…',
  },
  demo: 'まずデモを見る',
  createToken: 'fine-grained token を作成 ↗',
  storage: {
    title: 'トークンの保存方法',
    body: 'リポジトリごとの PAT をそれぞれ AES-GCM で包み、同じデータキーを共有します。データキーはさらに、デバイス指紋またはパスワードから PBKDF2 で派生したキーで包みます。二要素の場合はパスワードと指紋が一緒に派生に使われ、どちらか一方が欠けてもいけません。トークンは暗号文として localStorage にあるだけで、ロック解除前はネットワークリクエストに含まれません。',
    note: 'デバイス指紋は秘密ではありません。本当のセキュリティ境界はパスワードです。デバイスを変えるか指紋が変わると、二要素では保管庫をリセットするしかありません。',
  },
  blog: {
    title: 'よそのブログにゃ',
    intro: 'よそのブログをこっそり覗いてみたいにゃ〜',
    hint: 'blog.ksable.top をぽちっと押して遊んでみてね (｡･ω･｡)ﾉ♡',
  },
};

export default setup;
