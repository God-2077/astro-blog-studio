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
pnpm test:e2e         # Playwright：setup + demo + live（默认用系统 Edge；需要 .env.local）
pnpm verify           # typecheck + lint + test + build
```

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
    frontmatter-form.tsx    按设置字段配置渲染的动态 frontmatter 表单
    frontmatter-fields-editor.tsx  设置页的字段增删/类型/必填编辑
    ui.tsx                  Badge / Field / Spinner / ErrorNote / EmptyState / Skeleton
  pages/                    dashboard / editor / settings / setup / unlock
  lib/
    github/live.ts          Octokit：getRepo/getTree/readFile/writeFile/deleteFile/moveFile
    github/fixture.ts       内存 gateway（demo）
    github/errors.ts        AppError + mapError（唯一错误翻译层）
    gateway/context.tsx     GatewayProvider / DemoGatewayProvider / isDemoRequested
    frontmatter/fields.ts   字段类型/默认集/校验/form 映射/新稿初始文档
    markdown/document.ts    frontmatter 解析、compose、按 key 回写、EOL/BOM
    markdown/render.ts      marked + katex + DOMPurify + shoka 预处理
    paths/                  normalize / exclusion matcher / commit-message
    tree/model.ts           文件树模型（相对根目录显示，路径保留全路径）
    vault/                  crypto / fingerprint / keystore / session
    demo/fixtures.ts         演示仓库与 12 篇示例
  stores/                   zustand：settings(persist)、vault、ui、rate-limit、last-commit、editor guard、pending-post
  styles/app.css            Tailwind v4 tokens + .abs-* 设计系统
tests/unit | live | e2e
scripts/                    seed/clean/test-env、design build/serve
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
6. **设计**
   - 组件样式优先用 `.abs-*` 设计系统；不要引入通用 SaaS 卡片网格/渐变/玻璃拟态。
   - 编辑器内部保持安静：无纹理、无旋转、无入场动画；动效尊重 `prefers-reduced-motion`。
   - 唯一实心樱粉按钮是「新建文章」；印章是唯一的红。
   - 改视觉先看 `DESIGN.md` 和 `design/directions.html`，不要另起一套主题。

## 测试协议

1. `pnpm test:seed`（测试仓库为空或需要恢复种子）。
2. `pnpm test` / `pnpm test:live`；live 会创建 `src/_e2e/<runId>/*` 并自动清理。
3. `pnpm test:e2e`：setup 建本地加密保险库（`tests/e2e/.auth/`，已 gitignore），demo 验证 fixture/字段配置/新稿草稿，live 创建/清理 `src/_e2e/*`，并断言新稿保存前 404、保存后单提交。默认使用系统 Edge；无 Edge 时安装 chromium 并改 `playwright.config.ts` 的 channel。
4. 手动 E2E 至少覆盖：demo 工作台 → 编辑器保存 → 提交小票；新稿先本地起草、不产生文件，盖章后一次创建；设置增删字段/必填校验；live 读取 CRLF 种子 → 保存 → 再 seed 恢复；移动/删除/冲突；390px。
5. `pnpm verify`；`pnpm test:clean`；轮换测试 token。

## 代码风格

- TS strict + `noUncheckedIndexedAccess`；禁止 `any`（确实需要时用 `unknown` + 收窄）。
- 导入顺序由 Biome 管理；单引号、行宽 128、LF。
- 组件小、纯函数进 `lib/`；服务端状态只放 TanStack Query，UI 状态放 zustand。
- 不新增没人用的依赖；不把设计稿塞进 `src/`；`design/` 被 Biome 排除。
- 修改了公开行为（设置/错误/安全）时同步 README 和 DESIGN.md。
