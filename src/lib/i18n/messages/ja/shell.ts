import type { ShellMessages } from '../zh-CN/shell';

const shell: ShellMessages = {
  nav: {
    toggleSidebar: { open: 'ファイル索引を開く', close: 'ファイル索引を閉じる' },
    closeSidebar: 'ファイル索引を閉じる',
    home: 'ワークスペースに戻る',
    newPost: '新規',
    settings: '設定',
    lock: 'ロック',
    githubRepo: 'GitHub でリポジトリを開く',
    update: { aria: '新しいバージョンがあります。更新の通知を見る', title: '新しいバージョンあり' },
    projectSource: 'GitHub でプロジェクトのソースを開く',
  },
  demo: {
    badge: 'デモモード',
    banner:
      'デモモード：サンプルリポジトリはメモリ上にだけあり、GitHub には接続しません。未保存バックアップはこのデバイスのデモ用キーに保存されます。再読み込みすると最初のサンプルに戻ります。',
    settings: '設定を見る',
    exit: 'デモを終了 / 実際のリポジトリに接続',
  },
  footer: {
    demoMode: 'in-memory fixture',
    liveMode: 'github.com · content repo',
    cached: { one: '{count} 件をキャッシュ', other: '{count} 件をキャッシュ' },
  },
  leave: {
    title: '現在の記事に未保存の変更があります。離れてもよろしいですか？',
    confirm: '離れる',
    cancel: '編集を続ける',
  },
  tree: {
    title: '索引カード',
    count: { one: '{count} 件', other: '{count} 件' },
    refresh: '更新を確認',
    refreshBusy: '更新を確認中',
    refreshHint: '更新を確認（ファイルツリー + 記事）',
    searchPlaceholder: 'ファイル / パスを検索',
    searchLabel: 'ファイルを検索',
    empty: 'Markdown ファイルが見つかりません。',
    emptyHint: 'ルートディレクトリと除外ルールを確認してください。',
    noMatch: '「{query}」に一致するファイルがありません。',
    excluded: '{count} 件を除外',
    rules: 'ルール',
  },
  newPost: {
    eyebrow: 'new draft',
    title: '新規記事',
    description:
      'まずローカルで下書きします。スタンプを押すときに 1 回だけコミットし、エディターを開いただけではリポジトリに書き込みません。',
    titleLabel: 'タイトル',
    titlePlaceholder: '例：メモ：今日の文法メモ',
    dirLabel: 'ディレクトリ',
    dirHint: 'ブログのルートディレクトリ内で選択または入力',
    filenameLabel: 'ファイル名',
    filenameHint: '空欄の場合はタイトルを使用。拡張子なしは .md を補い、それ以外の拡張子はそのままで注意を表示します',
    filenameHintRequired: '必須です。拡張子なしは .md を補い、それ以外の拡張子はそのままで注意を表示します',
    filenameExtensionHint: '拡張子 {suffix} は .md / .mdx ではありません。{name} として作成します',
    preview: '作成予定 · 保存時にコミット',
    commitMessage: 'コミットメッセージ：',
    start: '下書きを始める',
    parking: '下書きに保存中…',
    errors: {
      titleRequired: 'タイトルを空にはできません',
      filenameRequired: 'ファイル名を空にはできません',
      filenameSeparator: 'ファイル名に / やバックスラッシュは使用できません。「ディレクトリ」欄に入力してください',
      filenameControl: 'ファイル名に制御文字は使用できません',
      filenameIllegalChars: 'ファイル名に次の文字は使用できません：{chars}',
      filenameReserved: '「{name}」はシステムの予約名です。別のファイル名にしてください',
      filenameTrailingDot: 'ファイル名の末尾をピリオド（.）にすることはできません',
      pathTaken: 'このパスには既にファイルがあります',
      parkFailed:
        '前の新規記事を下書きに保存できませんでした。このデバイスのストレージを空けるか、その新規記事に戻って処理してからもう一度お試しください。',
    },
    existingDraft: {
      title: 'まだコミットしていない新規記事の下書きがあります。',
      description:
        '続けると、前の記事をこのデバイスの下書きに保存してから、新しい記事を白紙で始めます。あとで下書きから開き直せます。',
      confirm: '下書きに保存して続ける',
      cancel: '新規作成しない',
    },
  },
};

export default shell;
