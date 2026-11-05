import type { CommonMessages } from '../zh-CN/common';

const common: CommonMessages = {
  language: '表示言語',
  confirm: '確認',
  cancel: 'キャンセル',
  save: '保存',
  close: '閉じる',
  back: '戻る',
  retry: '再試行',
  loading: '読み込み中',
  loadingEditor: 'エディターを読み込み中',
  copy: 'コピー',
  copied: 'コピーしました',
  delete: '削除',
  edit: '編集',
  add: '追加',
  remove: '削除',
  open: '開く',
  closeToast: '通知を閉じる',
  themeLabel: 'テーマ',
  theme: {
    system: { label: 'システムに従う', hint: 'システムのダーク／ライトに合わせて自動で切り替わります' },
    day: { label: '昼', hint: '暖かな紙の昼のデスク' },
    night: { label: '夜', hint: '暖かな墨色の夜の紙。単なる黒反転ではありません' },
  },
  vaultMode: {
    device: {
      label: 'デバイス指紋',
      hint: 'このデバイスでは自動でロック解除され、再読み込み後すぐに開けます。共用のパソコンにはおすすめしません。',
      autoLabel: 'デバイス指紋で自動ロック解除',
    },
    password: {
      label: 'パスワード',
      hint: '新しいタブを開くたびにパスワードを入力します。デバイスに紐づかないので、別のデバイスでも使えます。',
    },
    twoFactor: {
      label: 'パスワード + デバイスの二要素',
      hint: 'パスワードとこのデバイスの指紋の両方が一致する必要があります。どちらかを失うと保管庫をリセットするしかありません。',
    },
    legacy: '旧バージョン：パスワードまたはデバイス指紋',
    none: '未設定',
  },
  fieldHint: {
    description: 'SEO / 一覧の概要',
    link: 'カスタム URL slug',
    cover: 'カバー画像のパス',
    categories: '階層は > で表現',
    hideFrom: 'home / home_rss / rss / all',
  },
  noDate: '日付なし',
  untitled: '無題',
  units: {
    words: { one: '{count} 文字', other: '{count} 文字' },
    readingTime: { one: '{count} 分', other: '{count} 分' },
  },
  passwordMinLength: { one: '少なくとも {count} 文字', other: '少なくとも {count} 文字' },
  appDescription:
    'ブラウザーで動く純フロントエンドの Markdown ブログワークスペース。GitHub API でコンテンツリポジトリを直接読み書きし、バックエンドサーバーはありません。トークンはこのデバイス上で暗号化して保存されるだけです。',
};

export default common;
