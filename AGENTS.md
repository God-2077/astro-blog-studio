# AGENTS.md — astro-blog-studio

本目录是一个**独立的浏览器端应用**，不属于 `astro-blog/` 的 Astro 构建，也不参与根仓库的 workspace。它通过 GitHub API 读写内容仓库，没有服务器运行时。

先读：`README.md`（使用/安全/测试）、`DESIGN.md`（视觉与交互规范）、`design/DECISION.md`（方向契约）。

## 命令（workdir 必须是本目录）

```
pnpm install
pnpm dev              # http://localhost:5173
pnpm build            # tsc + vite build → dist/
pnpm preview          # http://localhost:4174
pnpm typecheck
pnpm lint             # Biome: safe, no writes
pnpm lint:fix         # 会格式化；本仓库本身是新建的，可接受，但注意别把设计 HTML 卷进来（biome 已 exclude design）
pnpm test             # 单元测试
pnpm test:seed        # 测试仓库为空时创建首个提交并写入种子
pnpm test:live        # 真实 GitHub 集成测试（会写 src/_e2e/*，最后清理）
pnpm test:clean       # 兜底清理 src/_e2e/*
pnpm test:e2e         # Playwright：setup + demo + live + pwa（默认用系统 Edge；live 需要 .env.local）
pnpm test:e2e:pwa     # 只跑 PWA 组：会先 vite build 再 vite preview 验证真实产物
pnpm pwa:icons        # 重新生成 public/icon-*.png（scripts/generate-pwa-icons.mjs，零依赖）
pnpm verify           # typecheck + lint + test + build
```

> `pnpm dev` 不注册 Service Worker（`devOptions.enabled:false`，虚拟模块是 no-op stub）；PWA 只能在 `pnpm build` + `vite preview` 或线上验证。

**pnpm only。** Node ≥ 20.19。

## 架构地图

```
src/
  App.tsx / main.tsx        路由、QueryClient、Toaster、lazy editor
  components/
    app-shell.tsx           顶栏、演示条、桌面索引、移动抽屉、CSS 外框
    protected-layout.tsx    vault 状态 + live/demo GatewayProvider
    tree-panel.tsx          文件树、搜索、排除计数、离开未保存确认
    new-post-dialog.tsx     新建文章 → 本地草稿（不写 API）
    backup-dialog.tsx       「发现未保存的备份」AlertDialog（稍后 / 丢弃 / 恢复）
    confirm-toast.tsx       sonner 确认条：confirmAction → Promise<boolean>（取代 window.confirm）
    unlock-mode-picker.tsx  设备指纹 / 密码 / 密码 + 设备双因子（严格 AND）
    frontmatter-form.tsx    按设置字段配置渲染的动态 frontmatter 表单
    frontmatter-fields-editor.tsx  设置页的字段增删/类型/必填编辑
    pwa-update.tsx          注册 SW、轮询更新、把状态同步进 store（dev 下是 no-op）
    pwa-update-dialog.tsx   「网站有新版本」AlertDialog（只提醒，不自动刷新）
    ui.tsx                  Badge / Field / Spinner / ErrorNote / EmptyState / Skeleton
  pages/                    dashboard / editor / settings / setup / unlock
  hooks/                    use-data / use-content-sync / use-auto-lock / use-editor-backup / use-pending-draft
  lib/
    backup/model.ts         备份记录校验、整文件快照、恢复映射
    backup/envelope.ts      AES-GCM 备份信封（整份记录 + AAD 绑定槽位/元数据）
    backup/store.ts         IndexedDB（idb-keyval）+ 同页写穿、加密写入、迁移、上限与清理
    backup/flush.ts         锁定前 flush 当前草稿的注册表（带超时、吞错）
    drafts/model.ts         草稿记录校验、文本/备份 → 草稿、标题回退
    drafts/envelope.ts      AES-GCM 草稿信封（AAD 绑定槽位/时间/大小）
    drafts/store.ts         IndexedDB `abs-drafts`、加密读写、列表/删除、按仓库清理
    drafts/box.ts           草稿箱视图合并显式草稿 + 自动备份（按路径去重、取较新）
    drafts/pending.ts       内存新稿 → 草稿箱（优先最新备份，避免回退旧内容）
    content/model.ts        文章缓存记录/上限/校验、repoKey/slot/signature
    content/diff.ts         按路径 + blob sha 的 added/modified/deleted diff
    content/envelope.ts     AES-GCM 文章信封（AAD 绑定仓库/路径/sha）
    content/storage.ts      IndexedDB `abs-content` 加密读写、内存写穿、前缀清理
    content/sync.ts         首次全量 / 树比对增量 / 失败重试 / 持久化
    github/live.ts          Octokit + GraphQL：getRepo/getTree/readFile/readFiles/writeFile/deleteFile/moveFile
    github/fixture.ts       内存 gateway（demo）
    github/errors.ts        AppError + mapError（唯一错误翻译层）
    gateway/context.tsx     GatewayProvider / DemoGatewayProvider / isDemoRequested
    frontmatter/fields.ts   字段类型/默认集/校验/form 映射/新稿初始文档
    markdown/document.ts    frontmatter 解析、compose、按 key 回写、EOL/BOM
    markdown/render.ts      marked + katex + DOMPurify + shoka 预处理
    markdown/editor-theme.ts  CodeMirror 主题 + Markdown 语法高亮（--abs-md-* 角色）
    paths/commit-message.ts 提交模板（含 {title}）/ title 回退
    paths/                  normalize / exclusion matcher
    pwa/update-polling.ts   SW 更新检测：节流 + single-flight + 可见/在线判断
    tree/model.ts           文件树模型（相对根目录显示，路径保留全路径；按 tree 引用 memo）
    vault/                  crypto(HKDF 备份/草稿/文章子密钥) / fingerprint / keystore(三种解锁模式) / session / mode
    demo/fixtures.ts         演示仓库与 12 篇示例
  stores/                   zustand：settings(persist)、vault、content、drafts、ui、rate-limit、last-commit、editor guard、pending-post、pwa
  styles/app.css            Tailwind v4 tokens + .abs-* 设计系统
  vite-env.d.ts             virtual:pwa-register/react 的类型引用
tests/unit | live | e2e
public/                     robots.txt + PWA 图标（由 pnpm pwa:icons 生成并提交）
scripts/                    seed/clean/test-env、design build/serve、generate-pwa-icons
```


## 不可违反的约束

1. **PAT 安全**
   - 不允许明文 PAT 进 localStorage / 日志 / DOM / URL / 构建产物 / 测试快照。
   - `vaultSession` 只在内存保存 PAT、数据密钥与派生的备份/草稿/文章缓存密钥；锁定必须先 flush 加密草稿，再清空 session、备份/草稿内存、文章缓存明文摘要和 React Query 缓存。
   - `.env.local` 只给 Node 测试；不要提交；测试结束后轮换 token。
   - 不引入第三方统计、脚本、字体 CDN、iframe、外链图片上传。
   - 解锁方式只有三种：`device` / `password` / `two-factor`。双因子是严格 AND：密码 KEK 混入本机指纹，payload 里**不得**同时存在独立的 `device` 包装；也不要恢复「设备指纹自动解锁」按钮。
2. **浏览器纯前端**
   - 不新增后端、不调用自建 API、不在构建时读取私有内容。
   - 外部网络只有 `api.github.com`（以及 GitHub 的 html_url 点击跳转）。
   - 预览必须经 `renderMarkdown`（DOMPurify）；禁止直接 `dangerouslySetInnerHTML` 原始 Markdown。
3. **内容保真**
   - 保存/移动要保留 CRLF/LF/BOM/结尾换行（`parseDocument` + `composeDocument`）。
   - 源文件模式（编辑器「表单 / 源文件」）直接写整份文件：只还原原文件的 EOL/BOM（`toEditingText` + `composeSourceDocument`），不解析 frontmatter 重写、不校验字段、不自动补 `updated`、不折叠结尾空行。
   - frontmatter 只改变化的 key；未知字段、注释行尽量原样保留。
   - 更新/删除/移动写操作必须带 sha；409 映射为 CONFLICT，不得静默覆盖。新建的首次创建是唯一例外（见提交协议）。
   - 路径一律经 `normalizeRepoPath`；排除规则支持前缀/glob；不信任用户输入。
4. **提交协议**
   - 新建文章：对话框只写 `usePendingPost`，**首次保存前禁止任何写 API**；首次 `writeFile` 不带 `sha`，只允许一次创建提交，消息用 `create` 模板；之后保存才带 `sha`、用 `update` 模板。
   - 移动/重命名必须是一个提交（Git Data API：blob → tree → commit → ref）。
   - 提交消息用设置里的模板；未知占位符保留原文。
   - 错误必须走 `mapError` 翻译成用户可执行的中文提示。
5. **Frontmatter 字段**
   - 字段配置是 `Settings.frontmatter.fields`；编辑器表单、新稿初始 frontmatter、必填校验都从它派生。
   - 字段名必须通过 `validateFrontmatterFields`；不要硬编码某个字段（title/date 也只是默认 required）。
   - 删除配置字段不等于删除文件里的键；未知字段保留；空可选字段回写时用 `null` 删除键块。
   - 不把字段配置写进 `astro-blog` schema；它是应用层表单配置。
6. **Dashboard 数据读取（本机文章缓存 + 增量同步）**
   - 首页文章列表与草稿/加密计数只能来自 `stores/content`（本机加密缓存），不要恢复到逐文件 `useQueries` 或每次打开全量 `readFiles`。
   - 首次打开（本机无 meta / 配置签名变化 / 强制全量）才全量读取：`planIndex` 取前 `MAX_INDEX_FILES = 1000` 篇，20 篇 / 批走 `gateway.readFiles`（一次 GraphQL，失败回退 Contents REST）。之后每次打开只拉 HEAD tree（`useTree`），用 map 的 tree sha 快速判断不变，否则按路径 + blob sha diff，只读 added + modified，删除 deleted 的本地记录。
   - meta 记录 `treeSha` + 签名 + 文件 blob sha 清单；写入必须用**实际读到的 blob sha**。失败的批次不得让 meta 误报完整：failed `modified` 保留旧 sha 以便重试，failed `added` 不写入 meta；`truncated` 时跳过删除。写入失败（配额）只降级为内存会话并提示，不得阻塞浏览。
   - 并发数来自设置 `content.indexConcurrency`（1–10，默认 3，`clampIndexConcurrency` 兜底）；改 schema 字段必须给旧持久化数据留默认值（zod `.catch`）。
   - 不要再把批量结果回填 `['file']`：编辑器按需读取远端文件（同一文件 60s 内复用 RQ 缓存），避免缓存文本覆盖编辑器刚保存/刚读取的内容。
   - 改动 gateway 批量逻辑或同步逻辑时，必须同时验证 CORS/权限、CJK 路径、超大/缺失文件、REST 回退、截断与写入降级。
7. **设计**
   - 组件样式优先用 `.abs-*` 设计系统；不要引入通用 SaaS 卡片网格/渐变/玻璃拟态。
   - 编辑器内部保持安静：无纹理、无旋转、无入场动画；动效尊重 `prefers-reduced-motion`。
   - 唯一实心樱粉按钮是「新建文章」；印章是唯一的红。
   - 用户确认统一走 `confirmAction`（`components/confirm-toast.tsx`），不要再用 `window.confirm` / `alert`；它返回 `Promise<boolean>`，调用方必须 `await` 并在确认后继续 `await` 自己的异步动作。破坏性操作的确认按钮用 `.abs-btn-danger`。
   - 改视觉先看 `DESIGN.md` 和 `design/directions.html`，不要另起一套主题。
8. **PWA 与缓存**
   - Service Worker 只预缓存同源构建产物（html/js/css/woff2/图标）；`api.github.com` 必须保持 `NetworkOnly`，**不得把 API 响应写进 CacheStorage**（私有内容与令牌语义）。
   - 更新只能由用户点击「立即刷新」触发，禁止自动 reload、禁止把 `skipWaiting`/`clientsClaim` 打开来“自动升级”；「稍后」必须始终可用。
   - `pnpm dev` 不注册 SW；PWA 的任何行为只在 `pnpm build` + `pnpm preview` 或线上验证（e2e 的 `pwa` 组就是这么跑的）。
   - `public/icon-*.png` 是生成物：改图标要改 `scripts/generate-pwa-icons.mjs` 并重跑 `pnpm pwa:icons`，不要手改 PNG。
9. **未保存备份**
   - 只写本机 IndexedDB（`lib/backup/store.ts`）；键含 `mode:owner/name@branch` + path；不得上传、不得包含 PAT；不得把备份写进 CacheStorage。
   - **真实仓库（`live:`）备份必须加密**：整份 `BackupRecord` 用保险库数据密钥经 HKDF 派生的 AES-GCM 子密钥加密（`lib/backup/envelope.ts`）；没有密钥时写入返回 `'locked'` 且不得回落明文。demo（`demo:`）没有保险库，保持明文。
   - 锁定前必须 `flushActiveBackup()` 再清密钥；`reset`（重置保险库）要清空本机所有 `live:` 备份并清备份内存；解锁后 best-effort 迁移旧明文备份。
   - 每个编辑器会话进入时只检查一次；恢复已有文件必须保留备份的 `baseSha`，保存仍走 409 冲突；恢复新稿只写 `usePendingPost`，首次保存前不得有写 API。
   - 保存、移动、删除成功后清除对应备份；保存成功后要同步抑制该会话的卸载 flush，避免把刚删除的记录写回。
   - `settings.editor.backupUnsaved` 关闭后停止读写；设置页的清除只清当前模式的当前仓库（所有分支）。
   - 弹窗样式遵循 DESIGN：恢复用 `.abs-btn`，丢弃 ghost + danger 描边，实心樱粉仍只给「新建文章」。
10. **本机文章缓存**
    - 只写本机 IndexedDB `abs-content`（`lib/content/storage.ts`）；键含 `mode:owner/name@branch`，meta 与文章行共用 `records` store，用 `meta\0` / `file\0` 前缀区分（不要为同一 DB 建两个 idb-keyval store，升级会互相抢）。
    - **真实仓库（`live:`）必须加密**：meta 和每篇文章都用数据密钥经 HKDF（`abs:content:v1`）派生的 AES-GCM 子密钥加密；AAD 绑定仓库/分支，文章还要绑定 path + blob sha。没有密钥时读取返回 null、写入返回 `'locked'`，不得回落明文。demo 只在内存，不写 IDB。
    - 锁定必须 `dropContentMemory()` + `useContent.reset()`；重置保险库要 `clearContentByPrefix('live:')`。缓存不得进入 CacheStorage，也不得包含 PAT。
    - 配置签名（rootDir/扩展名/排除）变化等同首次；同一 tree sha 且记录完整时才允许 0 读取；`truncated` 跳过删除；写入失败只降级并提示，不得丢会话。
    - 新增/修改同步逻辑必须覆盖：首次全量、无变化零读取、只读变更、删除、失败重试、强制全量、截断、配置变化、配额降级；README/DESIGN 与测试计数同步更新。
11. **草稿箱（显式草稿 + 自动备份）**
    - 只写本机 IndexedDB `abs-drafts`（`lib/drafts/store.ts`）；键含 `mode:owner/name@branch` + path，同一路径只保留最新一份；不得上传、不得包含 PAT、不得写进 CacheStorage。
    - **草稿箱列表必须合并 `abs-drafts` 与 `abs-backups`**（`lib/drafts/box.ts`）：`useDrafts` 同时 `listDrafts` + `listBackups`，按仓库/分支 + 路径去重、保存时间更新的胜出，自动备份标记 `origin: 'backup'`；不得只列显式草稿。打开备份条目仍走 `draft=1`（编辑器自己比较草稿与备份取较新者）；删除条目必须同时 `removeDraft` + `removeBackup`，避免删一份又冒出另一份。
    - **真实仓库（`live:`）草稿必须加密**：整份 `DraftRecord` 用数据密钥经 HKDF（`abs:draft:v1`，与备份/缓存子密钥分离）派生的 AES-GCM 子密钥加密；没有密钥时写入返回 `'locked'`，不得回落明文。demo（`demo:`）没有保险库，保持明文。
    - 锁定必须 `dropDraftMemory()` + `useDrafts.reset()`；重置保险库要 `clearDraftsByPrefix('live:')`。解密后的草稿只在内存写穿缓存，锁定即丢弃。
    - 编辑器「保存草稿」只写本机，**不调用任何写 API**；记录必须带完整的 `state`（表单/源文件模式、原始 YAML、正文、`sourceText`）与已有文件的 `baseSha`。从草稿箱打开走 `restoreToEditorState`，保存仍按 `baseSha` 走 409 冲突。
    - 新建文章仍先在 `usePendingPost` 起草；开始下一篇前必须先把上一篇经 `capturePendingDraft`（优先最新编辑器备份 → 已有草稿 → 初始文本）写入草稿箱，写入成功后才能清内存草稿；失败要中止并提示，不得覆盖丢失。
    - 从草稿箱打开时跳过自动备份弹窗；若同路径自动备份比草稿新，必须用备份内容恢复（不丢离开前的最新编辑）。提交成功（新建稿或本次会话来自草稿）后清除该路径草稿；移动/删除同步清理。普通打开文章时不要自动删除草稿箱里的旧草稿。

## 测试协议

1. `pnpm test:seed`（测试仓库为空或需要恢复种子）。
2. `pnpm test` / `pnpm test:live`；live 会创建 `src/_e2e/<runId>/*` 并自动清理。
3. `pnpm test:e2e`：setup 用「密码」模式建本地加密保险库（`tests/e2e/.auth/`，已 gitignore；不要用双因子，避免指纹来源波动导致 flaky），demo 验证 fixture/字段配置/源文件模式/新稿草稿/`{title}`/未保存备份恢复与丢弃，live 创建/清理 `src/_e2e/*`，并断言首访 1 次 tree + 1 次 GraphQL 批量、刷新后 0 次文章内容请求且 `abs-content` 中只有 `v: 1` 密文、新稿保存前 404、保存后单提交、真实草稿在 IndexedDB 中是 `v: 2` 密文且锁定/解锁后可恢复。`pwa` 组会先用 `vite build` 构建再 `vite preview`：断言 manifest/图标/SW、断网从预缓存打开、以及 waiting 新版本 → 弹窗 → 「稍后」→ 徽标 → 「立即刷新」才 reload（会临时 append `dist/sw.js` 并在 afterAll 还原）。默认使用系统 Edge；无 Edge 时安装 chromium 并改 `playwright.config.ts` 的 channel。只想验 PWA 用 `pnpm test:e2e:pwa`。
4. 手动 E2E 至少覆盖：demo 工作台 → 编辑器保存 → 提交小票；新稿先本地起草、不产生文件，盖章后一次创建；设置增删字段/必填校验；源文件模式改整份文件并切回表单；未保存备份：改标题/源文件/新稿 → 刷新 → 稍后 → 恢复 → 保存后不再提示，以及丢弃后不再提示；双因子 Setup → 刷新必须输密码且不自动解锁、换指纹后失败并提示重置；真实仓库改标题后 IndexedDB 只有密文、锁定 → 解锁 → 恢复；live 读取 CRLF 种子 → 保存 → 再 seed 恢复；本机文章缓存：首访全量 → 刷新只检查 tree → 远端改/删/加后只读变更 → 设置强制全量 → 锁定/解锁仍可读 → 重置保险库清空 `live:` 缓存；移动/删除/冲突；390px；`pnpm build` 后 `pnpm preview` 断网重载与更新弹窗。
5. `pnpm verify`；`pnpm test:clean`；轮换测试 token。

## 代码风格

- TS strict + `noUncheckedIndexedAccess`；禁止 `any`（确实需要时用 `unknown` + 收窄）。
- 导入顺序由 Biome 管理；单引号、行宽 128、LF。
- 组件小、纯函数进 `lib/`；服务端状态只放 TanStack Query，UI 状态放 zustand。
- 不新增没人用的依赖；不把设计稿塞进 `src/`；`design/` 被 Biome 排除。
- 修改了公开行为（设置/错误/安全）时同步 README 和 DESIGN.md。
