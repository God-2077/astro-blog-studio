import type { DashboardMessages } from '../zh-CN/dashboard';

const dashboard: DashboardMessages = {
  eyebrow: { demo: 'demo workspace', live: 'workspace' },
  title: '今日は何を書きましょう？',
  actions: {
    sync: { syncing: '同期中…', checking: '確認中…', idle: '更新を確認' },
    drafts: { label: '下書き', open: 'このデバイスの下書きを見る', close: '記事一覧に戻る' },
    newPost: '新規記事',
  },
  treeTruncated: 'ファイルツリーが GitHub で切り詰められたため、インデックスが不完全な可能性があります。',
  summary: {
    syncing: '同期中 {done} / {total}',
    all: { one: 'リポジトリ全体で {count} 件', other: 'リポジトリ全体で {count} 件' },
    frontmatter: 'frontmatter を読み込み中',
  },
  stats: {
    label: '統計',
    posts: '全記事',
    excluded: '{count} 件を除外',
    reading: 'ファイルツリーを読み込み中',
    drafts: '下書き',
    encrypted: '暗号化',
    basedOn: { one: 'リポジトリ全体の {count} 件から', other: 'リポジトリ全体の {count} 件から' },
  },
  list: {
    recent: '最近更新',
    drafts: '下書き',
    loading: '読み込み中…',
    draftsMeta: '{count} 件 · 自動バックアップを含む · このデバイスのみ',
    sortLabel: '最近の記事の並び順',
    sortUpdated: 'frontmatter の updated の降順',
    sortDate: 'frontmatter の date の降順',
    demoPlain: 'デモモード · 平文',
    encrypted: 'AES-GCM 暗号化',
    truncated:
      'コンテンツリポジトリには {total} 件ありますが、一度に全体を読まないよう最初の {indexed} 件だけをインデックスします。',
    skipped: '{count} 件は未読み込みです（大きすぎるか、バイナリか、権限不足）。',
    badges: { draft: '下書き', sticky: 'ピン留め', encrypted: '暗号化', yaml: 'YAML エラー' },
    emptyTitle: 'Markdown ファイルがまだありません',
    emptyAction: 'ルートディレクトリと除外ルールを確認',
    emptyBody:
      '現在のルートディレクトリ {rootDir} に表示できる .md / .mdx がありません。除外ルールですべて隠れている可能性もあります。',
    pending: 'ファイルツリーには {count} 件ありますが、まだ frontmatter を読み込めていません。',
    loadMore: 'さらに読み込む',
    shown: '{shown} / {total} 件を表示中 · 1 回 {page} 件',
    allShown: { one: '{count} 件をすべて表示しました', other: '{count} 件をすべて表示しました' },
  },
  receipt: {
    title: 'コミットのレシート',
    archived: 'アーカイブ済み',
    waiting: '待機中',
    view: 'コミットを見る ↗',
    empty: '最初の記事を保存すると、ここにコミットのレシートが表示されます。',
  },
  goals: {
    title: '今日の小さな目標',
    item1: 'Markdown チートシートの表の節を仕上げる',
    item2: '読書メモの下書きを公開用に整える',
    item3: '古いメモに updated を足す',
  },
  cache: {
    local: 'このデバイスのキャッシュ',
    entries: { one: '{count} 件', other: '{count} 件' },
    memory: 'メモリのみ',
    branch: 'ブランチ',
    mode: 'モード',
    demo: 'メモリ内デモ',
    live: '実際のリポジトリ',
  },
  speedHint: 'ページを開いてから変更を一度保存するまで、目標は 30 秒未満。',
  settingsLink: '接続とコミットの設定',
  drafts: {
    parkFailedTitle: '前の新規記事を下書きに保存できませんでした',
    parkFailedDescription:
      'このデバイスのストレージがいっぱいか、ロックされている可能性があります。前の新規記事を先に片付けるか、ストレージを空けてからこの記事を開いてください。',
    removeTitle: '下書きから「{title}」を削除しますか？',
    removeDescription: 'このデバイスの下書き（自動バックアップを含む）が消去され、元に戻せません。',
    removeConfirm: '下書きを削除',
    removeFailedTitle: '下書きを削除できませんでした',
    removeFailedDescription: 'このデバイスのストレージが使えません。しばらくしてからもう一度お試しください。',
    removed: '下書きから削除しました',
    emptyTitle: '下書きは空です',
    emptyBody:
      'エディターで「下書きを保存」を押すか、未保存の編集を自動バックアップさせてください。スタンプを押すまでは、ここに表示されます。実際のリポジトリのコピーは保管庫の鍵で暗号化されます。',
    badges: { new: '新規', existing: '既存記事', backup: '自動バックアップ', source: 'ソースファイル' },
    removeAria: '下書きから削除：{title}',
    removeAction: '下書きから削除',
  },
  status: {
    error: '記事の同期が完了していません',
    checking: 'リモートの更新を確認しています…',
    loadingFull: '初回読み込み · すべての記事を読み込み中',
    loadingCache: 'このデバイスのキャッシュを読み込み中…',
    updating: '記事の変更を同期中',
    fallback: 'このデバイスのキャッシュ',
    synced: '同期済み · 追加 {added} / 変更 {modified} / 削除 {deleted}',
    persistFailed:
      'このデバイスのキャッシュへの書き込みに失敗しました（空き容量不足の可能性）。このセッションでは引き続き閲覧できますが、サイトを開き直すと再読み込みします。',
    lastError: '前回の同期が完了していません',
  },
};

export default dashboard;
