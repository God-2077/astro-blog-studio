import type { SettingsMessages } from '../zh-CN/settings';

const settings: SettingsMessages = {
  mode: {
    demo: 'デモモード',
    live: '実際のリポジトリ',
  },
  header: {
    title: '設定',
    backToDashboard: 'ワークスペースに戻る',
    saving: '保存中…',
    save: '設定を保存',
  },
  repos: {
    title: 'リポジトリ',
    meta: { one: '{count} 件 · 個別 PAT', other: '{count} 件 · 個別 PAT' },
    intro:
      'すべてのリポジトリで同じ保管庫とロック解除方法を共有します。切り替えてもパスワードの再入力は不要です。リポジトリごとに独自の PAT を持ち、コンテンツと除外、frontmatter フィールド、コミットメッセージもリポジトリごとに保存されます。切り替えはメモリ上の表示を消すだけで、このデバイスの暗号化キャッシュや下書きは削除しません。',
    add: 'リポジトリを追加',
    current: '現在',
    missingPat: 'PAT がありません',
    switch: '切り替え',
    tokenMissingHint: '先にこのリポジトリのトークンを更新してください',
    updateToken: 'トークンを更新',
    remove: '削除',
  },
  content: {
    title: 'コンテンツと除外',
    demoNote:
      'デモモードでは固定のサンプルリポジトリと除外ルールを使います。これらのフィールドは実際のリポジトリに接続すると有効になります。',
    rootDir: 'ルートディレクトリ',
    rootDirHint: 'リポジトリのルートからの相対パス',
    extensions: 'ファイル拡張子',
    extensionsHint: 'カンマ区切り。.md / .mdx 以外はプレーンテキストとして編集',
    timezone: 'タイムゾーン',
    timezoneHint: 'date テンプレートと updated に使用',
    visible: '現在表示中',
    visibleHint: 'ファイルツリーから',
    demoData: 'サンプルデータ',
    seeTree: 'ファイルツリーを参照',
    indexConcurrency: 'インデックス同時実行数',
    indexConcurrencyHint:
      '{min}–{max}、既定値 {default}。初回の全件読み込みと増分同期で同時に実行する 20 件ずつのバッチ数です。大きくすると速くなりますが、大きすぎると GitHub のレート制限にかかる可能性があります。',
    excludes: '除外ルール',
    excludesHint: '1 行に 1 件。プレフィックスまたは glob',
  },
  cache: {
    title: 'このデバイスの記事キャッシュ',
    demoMeta: 'デモモード · メモリのみ',
    meta: { one: '{count} 件 · AES-GCM', other: '{count} 件 · AES-GCM' },
    intro:
      '初回にリポジトリ全体の記事を一度読み込み、暗号化してこのデバイスの IndexedDB に保存します。以降は毎回ファイルツリーだけを取得し、パスと blob sha で照合して、追加・変更された記事だけを読み直し、削除された記事はキャッシュから消します。',
    cached: { one: '{count} 件をキャッシュ済み', other: '{count} 件をキャッシュ済み' },
    lastSynced: '前回の同期 {value}',
    neverSynced: '未同期',
    tree: 'ツリー {value}',
    phaseReadingFull: 'すべての記事を読み込み中…',
    phaseReadingCache: 'このデバイスのキャッシュを読み込み中…',
    phaseSyncing: '記事の変更を同期中…',
    phaseChecking: 'リモートの更新を確認中…',
    persistFailed:
      'このデバイスのキャッシュへの書き込みに失敗しました（空き容量不足の可能性）。このセッションでは引き続き閲覧できますが、サイトを開き直すと再読み込みします。',
    checkUpdates: '更新を確認',
    checking: '確認中…',
    forceFull: '強制的に全件更新',
    demoFooter: 'デモリポジトリはメモリ上にだけ存在し、デモモードではこのデバイスにキャッシュを書き込みません。',
    liveFooter:
      '実際のリポジトリは保管庫のデータキーから派生したサブキーで暗号化します。ロック後は読み取れず、保管庫をリセットすると一緒に消去されます。',
  },
  frontmatter: {
    title: 'frontmatter フィールド',
    meta: { one: '{count} 件のフィールド', other: '{count} 件のフィールド' },
    invalid: 'エラーあり',
    intro:
      'エディターのフィールド、型、必須チェックを決めます。フィールドを削除しても既存ファイルのキーは削除されず、未設定のフィールドはそのまま保持されます。',
  },
  fields: {
    required: '必須',
    nameAria: 'フィールド {index} の名前',
    typeAria: 'フィールド {name} の型',
    removeAria: 'フィールド {name} を削除',
    removeTitle: 'フィールドを削除',
    add: 'フィールドを追加',
    reset: 'よく使うフィールドに戻す',
    limit: '{count} / 40',
    hint: '名前に使えるのは英字、数字、アンダースコア、ハイフンです。title / date は astro-blog schema の必須項目で、削除すると保存した内容がビルドを通らない可能性があります。既存ファイルの未設定フィールドはそのまま保持されます。',
  },
  commit: {
    title: 'コミットメッセージ',
    hint: '{placeholders} が使えます。未知のプレースホルダーは原文のまま残ります。',
    confirmBefore: '保存前にコミットの確認を表示',
  },
  editor: {
    title: '編集とプレビュー',
    fontSize: '本文の文字サイズ',
    showLineNumbers: '行番号を表示',
    updateUpdatedAt: '保存時に updated を更新',
    previewHint:
      'プレビューは GFM、コード、数式、ネタバレ、ルビ、::: コンテナに対応します。生の HTML はサニタイズされ、リンクカードは通常のリンクに降格されます。',
    backupUnsaved: '未保存の変更をバックアップ',
    backupHint:
      '実際のリポジトリのバックアップは保管庫の鍵で暗号化してこのデバイスの IndexedDB に書き込み、ロック解除後しか復元できません。デモモードでは暗号化しません。エディターに入るときに確認して、復元を促します。',
    clearingBackups: '消去中…',
    clearBackups: 'このリポジトリのこのデバイスのバックアップを消去',
  },
  appearance: {
    title: '外観',
    meta: 'すぐに反映 · 現在{theme}',
    intro:
      '既定ではシステムに従います。手動で選ぶと記憶されます。夜は暖かな墨色の紙と生成り色のインクを使い、ライトテーマを反転したものではありません。',
  },
  security: {
    title: 'セキュリティ',
    encrypted: '暗号化して保存済み',
    tokens: 'トークン：{value}',
    demoNoToken: 'デモモードにはトークンがありません',
    tokensEncrypted: 'すべてのリポジトリで個別に暗号化して保存',
    currentMode: '現在のロック解除方法：',
    autoLock: '自動ロック（分、0 で無効）',
    legacyWarning:
      'これは旧バージョンの「パスワードまたは指紋」モードです。いずれかの方法を選んで更新すると、厳密な二要素または単一の方法に変わります。デバイスのラップは削除されます。',
    newPassword: '新しいパスワード',
    newPasswordHint: '少なくとも {min} 文字。現在のパスワードは不要です',
    newPasswordPlaceholder: '新しいパスワードを入力',
    updating: '更新中…',
    updateUnlock: 'ロック解除方法を更新',
    updateNote: 'すぐに反映され、このデバイスの保管庫に保存されます。暗号化済みの未保存バックアップは無効になりません。',
    lockNow: 'すぐにロック',
    resetVault: '保管庫をリセット',
    footer:
      '二要素では、パスワードを忘れた場合も指紋が変わった場合も復旧できず、保管庫をリセットして PAT を再入力するしかありません。このデバイスにある実際のリポジトリの未保存バックアップも一緒に消去されます。',
  },
  config: {
    title: '現在の設定',
    excludes: { one: '{count} 件の除外', other: '{count} 件の除外' },
    demoNote:
      'デモモードのリポジトリ内容はメモリ上にだけあります。未保存バックアップはこのデバイスのデモ用キーに保存されます（暗号化なし）。',
    liveNote: 'バックアップは暗号化してこのデバイスの IndexedDB に書き込まれるだけで、アップロードされません。',
  },
  confirm: {
    discardDescription:
      'リポジトリの切り替えや追加では、現在の設定ページの変更は自動保存されません。「続ける」を選ぶと、これらの未保存の変更は破棄されます。',
    continueLabel: '続ける',
    keepEditing: '編集を続ける',
    addRepoDiscard: 'リポジトリを追加して切り替える前に、現在の未保存の設定変更は破棄されます。',
    switchDiscard: '{repo} に切り替える前に、現在の未保存の設定変更は破棄されます。',
    clearBackupsTitle: 'このリポジトリの、このデバイス上の未保存バックアップを消去しますか？この操作は元に戻せません。',
    clearBackupsDescription:
      '現在のリポジトリの現在のブランチの、このデバイスのバックアップだけを消去します。GitHub 上のファイルには触れません。編集中の内容は再び書き込まれます。',
    clearBackupsConfirm: 'バックアップを消去',
    forceFullTitle:
      '強制的に全件更新すると、このリポジトリのこのデバイスの記事キャッシュを消去し、すべての記事を読み直します。続けますか？',
    forceFullDescription:
      '現在のインデックス同時実行数で読み直します。影響するのはこのデバイスのキャッシュだけで、GitHub 上のファイルは変更しません。',
    forceFullConfirm: '読み直す',
    removeTitle: 'このデバイスからリポジトリ「{repo}」を削除しますか？',
    removeDescription:
      '保管庫内のこのリポジトリの PAT を削除し（同じリポジトリの他のブランチがまだ使っている場合は残します）、リポジトリ単位の設定も削除します。このデバイスの暗号化された記事キャッシュ、下書き、バックアップはすぐには削除されません。保管庫をリセットしたときにまとめて消去されます。',
    removeConfirm: 'リポジトリを削除',
    resetVaultTitle:
      '保管庫をリセットすると、このデバイスにあるすべてのリポジトリの PAT とリポジトリ一覧が削除され、実際のリポジトリすべての未保存バックアップ、下書き、記事キャッシュも消去されます。現在のコンテンツ／フィールド／コミットテンプレートは次回設定するときの既定値として残ります。PAT の再入力が必要です。続けますか？',
    resetVaultDescription:
      'GitHub 上の記事は影響を受けません。リポジトリにコミットしていないこのデバイス上の内容は元に戻せません。',
    resetVaultConfirm: '保管庫をリセット',
    resetFieldsTitle: 'hello-world のよく使うフィールドに戻しますか？現在のフィールド一覧は置き換えられます。',
    resetFieldsDescription:
      '保存済みの記事にある他の frontmatter キーは削除されず、エディターが未知のフィールドとして保持します。',
    resetFieldsConfirm: '既定に戻す',
  },
  toast: {
    saved: '設定を保存しました',
    fieldInvalid: 'frontmatter フィールドに誤りがあります。先に修正してください',
    unlockUpdated: 'ロック解除方法を更新しました：{mode}',
    clearBackupsDone: 'このリポジトリのこのデバイスのバックアップを消去しました',
    clearBackupsFailed: '消去に失敗しました。しばらくしてからもう一度お試しください',
    demoNoCache: 'デモモードではこのデバイスにキャッシュを書き込みません',
    switched: '{repo} に切り替えました',
    addedAndSwitched: 'リポジトリを追加して切り替えました',
    tokenUpdated: '{repo} のトークンを更新しました',
    removed: 'リポジトリを削除しました',
  },
};

export default settings;
