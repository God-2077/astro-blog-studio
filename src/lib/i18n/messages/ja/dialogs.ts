import type { DialogsMessages } from '../zh-CN/dialogs';

const dialogs: DialogsMessages = {
  addRepo: {
    title: 'リポジトリを追加',
    description:
      'リポジトリごとに独自の PAT を保存しますが、保管庫とロック解除方法は共通です。追加後すぐにこのリポジトリへ切り替わります。',
    repo: 'リポジトリ',
    repoHint: 'owner/repository または GitHub URL',
    branch: 'ブランチ',
    branchHint: '空欄の場合はリポジトリの既定ブランチを使用',
    pat: 'PAT',
    patHint: '同じリポジトリのトークンが既にある場合は空欄で構いません',
    rootDir: 'ルートディレクトリ',
    rootDirHint: 'リポジトリのルートからの相対パス',
    excludes: '除外ルール',
    excludesHint: '1 行に 1 件。プレフィックスまたは glob',
    note: '新しいリポジトリは、まず現在のリポジトリの拡張子、タイムゾーン、インデックス同時実行数、frontmatter フィールド、コミットメッセージのテンプレートを引き継ぎます。これらの設定はその後、リポジトリごとに個別に保存されます。',
    repoRequired: '先にリポジトリを入力してください。',
    submit: '検証して追加',
    busy: '検証して追加中…',
    patFooter: 'PAT は暗号文としてこのデバイスの保管庫に書き込まれるだけで、ログや URL に現れることはありません。',
  },
  repoToken: {
    title: 'リポジトリのトークンを更新',
    description: '新しい PAT は同じ保管庫に暗号化して保存されます。同じリポジトリの他のブランチでも使われます。',
    label: '新しい GitHub PAT',
    hint: 'このリポジトリにアクセスできるか先に検証します',
    submit: '検証して更新',
    busy: '検証して保存中…',
  },
  missingToken: {
    title: 'このリポジトリに使えるトークンがまだありません',
    descriptionBefore: '現在のリポジトリ',
    descriptionAfter:
      'の PAT が保管庫にありません。再入力すると同じ保管庫に暗号化して保存され、他のリポジトリには影響しません。',
    label: 'GitHub PAT',
    hint: 'このデバイスの保管庫にのみ保存されます',
    submit: 'このリポジトリのトークンを保存',
    busy: '検証して保存中…',
    lock: 'ロック後はロック解除ページから保管庫をリセットしてください',
  },
};

export default dialogs;
