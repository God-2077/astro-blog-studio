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
    frontmatter-form.tsx    按设置字段配置渲染的动态 frontmatter 表单
    frontmatter-fields-editor.tsx  设置页的字段增删/类型/必填编辑
    pwa-update.tsx          注册 SW、轮询更新、把状态同步进 store（dev 下是 no-op）
    pwa-update-dialog.tsx   「网站有新版本」AlertDialog（只提醒，不自动刷新）
    ui.tsx                  Badge / Field / Spinner / ErrorNote / EmptyState / Skeleton
  pages/                    dashboard / editor / settings / setup / unlock
  hooks/                    use-data / use-auto-lock / use-editor-backup
  lib/
    backup/model.ts         备份记录校验、整文件快照、恢复映射
    backup/store.ts         IndexedDB（idb-keyval）+ 同页写穿、上限与清理
    github/live.ts          Octokit + GraphQL：getRepo/getTree/readFile/readFiles/writeFile/deleteFile/moveFile
    github/fixture.ts       内存 gateway（demo）
    github/errors.ts        AppError + mapError（唯一错误翻译层）
    gateway/context.tsx     GatewayProvider / DemoGatewayProvider / isDemoRequested
    frontmatter/fields.ts   字段类型/默认集/校验/form 映射/新稿初始文档
    markdown/document.ts    frontmatter 解析、compose、按 key 回写、EOL/BOM
    markdown/render.ts      marked + katex + DOMPurify + shoka 预处理
    paths/commit-message.ts 提交模板（含 {title}）/ title 回退
    paths/                  normalize / exclusion matcher
    pwa/update-polling.ts   SW 更新检测：节流 + single-flight + 可见/在线判断
    tree/model.ts           文件树模型（相对根目录显示，路径保留全路径；按 tree 引用 memo）
    vault/                  crypto / fingerprint / keystore / session
    demo/fixtures.ts         演示仓库与 12 篇示例
  stores/                   zustand：settings(persist)、vault、ui、rate-limit、last-commit、editor guard、pending-post、pwa
  styles/app.css            Tailwind v4 tokens + .abs-* 设计系统
  vite-env.d.ts             virtual:pwa-register/react 的类型引用
tests/unit | live | e2e
public/                     robots.txt + PWA 图标（由 pnpm pwa:icons 生成并提交）
scripts/                    seed/clean/test-env、design build/serve、generate-pwa-icons
```


## 不可违反的约束

1. **PAT 安全**
   - 不允许明文 PAT 进 localStorage / 日志 / DOM / URL / 构建产物 / 测试快照。
   - 解锁后的 PAT 只在 `vaultSession` 内存；锁定要清空 session 和 React Query 缓存。
   - `.env.local` 只给 Node 测试；不要提交；测试结束后轮换 token。
   - 不引入第三方统计、脚本、字体 CDN、iframe、外链图片上传。
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
6. **Dashboard 数据读取**
   - dashboard 的 frontmatter 索引必须走 `gateway.readFiles` 批量接口（20 篇 / 批，一次 GraphQL；失败回退 Contents REST）；不要回到逐文件 `useQueries`。
   - 索引必须覆盖全库（`MAX_INDEX_FILES = 1000` 上限并对用户明示），排序发生在截断之前；不要在文件树路径切片上做「最近」。
   - 批量结果要回填 `['file']` cache，并以 tree sha 作查询键；同一 tree 不重复请求，tree 变化时只重读 blob sha 改变的批次。
   - 并发数来自设置 `content.indexConcurrency`（1–10，默认 3，`clampIndexConcurrency` 兜底），不要在 hook 里硬编码；改 schema 字段必须给旧持久化数据留默认值（zod `.catch`），否则 store merge 会把用户设置整体重置。
   - 改动 gateway 批量逻辑必须同时验证 CORS/权限、CJK 路径、超大/缺失文件和 REST 回退。
7. **设计**
   - 组件样式优先用 `.abs-*` 设计系统；不要引入通用 SaaS 卡片网格/渐变/玻璃拟态。
   - 编辑器内部保持安静：无纹理、无旋转、无入场动画；动效尊重 `prefers-reduced-motion`。
   - 唯一实心樱粉按钮是「新建文章」；印章是唯一的红。
   - 改视觉先看 `DESIGN.md` 和 `design/directions.html`，不要另起一套主题。
8. **PWA 与缓存**
   - Service Worker 只预缓存同源构建产物（html/js/css/woff2/图标）；`api.github.com` 必须保持 `NetworkOnly`，**不得把 API 响应写进 CacheStorage**（私有内容与令牌语义）。
   - 更新只能由用户点击「立即刷新」触发，禁止自动 reload、禁止把 `skipWaiting`/`clientsClaim` 打开来“自动升级”；「稍后」必须始终可用。
   - `pnpm dev` 不注册 SW；PWA 的任何行为只在 `pnpm build` + `pnpm preview` 或线上验证（e2e 的 `pwa` 组就是这么跑的）。
   - `public/icon-*.png` 是生成物：改图标要改 `scripts/generate-pwa-icons.mjs` 并重跑 `pnpm pwa:icons`，不要手改 PNG。
9. **未保存备份**
   - 只写本机 IndexedDB（`lib/backup/store.ts`）；键含 `mode:owner/name@branch` + path；不得上传、不得包含 PAT；不得把备份写进 CacheStorage。
   - 每个编辑器会话进入时只检查一次；恢复已有文件必须保留备份的 `baseSha`，保存仍走 409 冲突；恢复新稿只写 `usePendingPost`，首次保存前不得有写 API。
   - 保存、移动、删除成功后清除对应备份；保存成功后要同步抑制该会话的卸载 flush，避免把刚删除的记录写回。
   - `settings.editor.backupUnsaved` 关闭后停止读写；设置页的清除只清当前模式的当前仓库（所有分支）。
   - 弹窗样式遵循 DESIGN：恢复用 `.abs-btn`，丢弃 ghost + danger 描边，实心樱粉仍只给「新建文章」。

## 测试协议

1. `pnpm test:seed`（测试仓库为空或需要恢复种子）。
2. `pnpm test` / `pnpm test:live`；live 会创建 `src/_e2e/<runId>/*` 并自动清理。
3. `pnpm test:e2e`：setup 建本地加密保险库（`tests/e2e/.auth/`，已 gitignore），demo 验证 fixture/字段配置/源文件模式/新稿草稿/`{title}`/未保存备份恢复与丢弃，live 创建/清理 `src/_e2e/*`，并断言新稿保存前 404、保存后单提交、dashboard 1 次 GraphQL 批量且 0 次 summary Contents 请求。`pwa` 组会先用 `vite build` 构建再 `vite preview`：断言 manifest/图标/SW、断网从预缓存打开、以及 waiting 新版本 → 弹窗 → 「稍后」→ 徽标 → 「立即刷新」才 reload（会临时 append `dist/sw.js` 并在 afterAll 还原）。默认使用系统 Edge；无 Edge 时安装 chromium 并改 `playwright.config.ts` 的 channel。只想验 PWA 用 `pnpm test:e2e:pwa`。
4. 手动 E2E 至少覆盖：demo 工作台 → 编辑器保存 → 提交小票；新稿先本地起草、不产生文件，盖章后一次创建；设置增删字段/必填校验；源文件模式改整份文件并切回表单；未保存备份：改标题/源文件/新稿 → 刷新 → 稍后 → 恢复 → 保存后不再提示，以及丢弃后不再提示；live 读取 CRLF 种子 → 保存 → 再 seed 恢复；移动/删除/冲突；390px；`pnpm build` 后 `pnpm preview` 断网重载与更新弹窗。
5. `pnpm verify`；`pnpm test:clean`；轮换测试 token。

## 代码风格

- TS strict + `noUncheckedIndexedAccess`；禁止 `any`（确实需要时用 `unknown` + 收窄）。
- 导入顺序由 Biome 管理；单引号、行宽 128、LF。
- 组件小、纯函数进 `lib/`；服务端状态只放 TanStack Query，UI 状态放 zustand。
- 不新增没人用的依赖；不把设计稿塞进 `src/`；`design/` 被 Biome 排除。
- 修改了公开行为（设置/错误/安全）时同步 README 和 DESIGN.md。
