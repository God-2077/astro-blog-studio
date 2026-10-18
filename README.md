# Astro Blog Studio

浏览器端、纯前端的 Markdown 博客工作台。用 GitHub API 直接读写内容仓库里的 Markdown，不需要后端服务器，也不把令牌交给任何第三方。

源码：<https://github.com/God-2077/astro-blog-studio>

视觉方向来自本仓库的决策台 **01 樱糖手帐**：文件是索引卡，编辑是纸，提交是盖章。决策过程与完整原型见 [`design/directions.html`](design/directions.html) 和 [`design/DECISION.md`](design/DECISION.md)。

![工作台](docs/screenshots/dashboard.png)
![编辑器](docs/screenshots/editor.png)
![夜间工作台](docs/screenshots/night-dashboard.png)
![夜间编辑器](docs/screenshots/night-editor.png)

## 已实现

- **文件索引**：树形浏览、路径搜索、排除规则过滤、刷新；显示目录内 Markdown 数量与被排除数量。
- **编辑**：CodeMirror 6 Markdown 编辑 + 实时预览；**表单 / 源文件**双模式——表单按 frontmatter 字段编辑，源文件模式直接编辑整份文件（含 frontmatter），保存时原样写回。GFM、表格、代码、KaTeX 数学、剧透 `!!x!!`、高亮 `==x==`、插入 `++x++`、ruby、`:::info` 容器、`<!-- more -->` 摘要分隔。
- **frontmatter**：字段可在设置中增删；每个字段有名称、类型（`string / date / number / boolean / list`）和必填开关。默认预置 hello-world 常用字段（title、date、updated、description、categories、tags、draft、sticky、password、cover、keywords）；必填为空会阻止保存；未知字段原样保留；YAML 损坏时降级为原文编辑。
- **写操作**：新建、保存、删除、移动/重命名。新建先在本地起草，**第一次保存才创建文件，只调用一次创建 API**；移动用 Git Data API 在**一个提交**里完成；更新带 `sha` 乐观锁，冲突时弹出「重新加载 / 覆盖远端 / 取消」。
- **格式保真**：保留 CRLF / LF / BOM / 结尾换行；分块 base64 处理，避免大文件栈溢出；UTF-8 解码替换字符检测。
- **提交体验**：提交消息模板（`{path}`、`{title}`、`{oldPath}`、`{newPath}`、`{dir}`、`{name}`、`{date}`、`{action}`）；提交前确认；提交小票（sha、路径、时间、GitHub 链接）；API 配额显示。
- **Dashboard 索引**：tree 之后按 20 篇 / 批用 GraphQL 批量读取 frontmatter，分批完成即渲染；「最近动过」、草稿与加密计数都基于全库，排序依据是 frontmatter 的 `updated` / `date`。同一 tree 命中缓存，tree 变化时只重读 blob sha 改变的批次；超过 1000 篇时只索引前 1000 篇并提示；GraphQL 不可用时回退 Contents REST。
- **真实 / 演示双模式**：`?demo=1` 使用内存 fixture，不联网、不写仓库，适合评审 UI 和录屏。
- **外观 / 夜间模式**：默认跟随系统，也可在设置里固定为昼或夜；`<html data-theme>` 在首帧前由内联脚本应用，避免刷新白闪。夜间是暖墨纸与米白墨（不是反相、不用纯黑），CodeMirror、Markdown 预览、设置、解锁与移动端共用同一套 `--abs-*` token。
- **保险库**：PAT 以 AES-GCM-256 加密后写 localStorage；密钥由 PBKDF2-SHA256（600k 次）派生；设备指纹（FingerprintJS）自动解锁；可选密码，支持「密码 + 设备」双因子；内存会话令牌；锁定清空。
- **设置**：根目录、扩展名、排除规则、时区、Frontmatter 字段、提交模板、字号/行号、保存时更新 `updated`、自动锁定、密码更换、重置保险库、外观（跟随系统 / 昼 / 夜）。
- **响应式**：桌面双栏、移动端抽屉索引；`prefers-reduced-motion` 降级。

## 快速开始

```bash
cd astro-blog-studio
pnpm install
pnpm dev
```

打开 <http://localhost:5173>。

- 先看界面：<http://localhost:5173/?demo=1>
- 单元测试：`pnpm test`
- 类型检查 / 静态检查 / 构建：`pnpm typecheck`、`pnpm lint`、`pnpm build`

> 本仓库的自动测试使用 `astro-blog-content-test` 这个专用测试仓库。真实的 `astro-blog-content` 请单独创建一个只授权它的 fine-grained token；测试 token 不要用于生产。

## 首次连接

1. 在 GitHub 创建 **fine-grained personal access token**，只授权目标仓库：
   - `Repository permissions → Contents: Read and write`
   - `Repository permissions → Metadata: Read-only`（自动包含）
   - 可选：`Commit statuses: Read-only`（用于 README 里说明的状态自检；当前版本未读取）
   - 不需要 PR、Actions、Pages、Releases 权限。
2. 在应用里填仓库（`owner/name` 或 GitHub URL）、分支（留空用默认分支）、文章根目录（本博客是 `src`）和排除规则（默认建议见 `.env.example` / 设置页）。
3. 选择解锁方式：
   - 勾选设备指纹：刷新后自动解锁；
   - 同时设置密码：每次新标签页需要验证，可再加设备双因子。
4. 连接成功后打开工作台；点索引卡里的文件进入编辑器。

测试仓库 `God-2077/astro-blog-content-test` 已在开发时用 `pnpm test:seed` 写入种子文件；空仓库也能连接，但文件树会提示「仓库是空的，请先创建一次初始提交」。

## 内容与提交规则

- **可见文件**：根目录下、扩展名匹配、且不命中排除规则的文件。排除支持目录前缀与 glob（如 `src/content/blog/en`、`src/content/**/draft/**`）。
- **frontmatter**：编辑器表单由设置中的字段列表动态生成；字段类型、必填、增删都在设置页维护。只改表单里变化的键；未识别字段、注释行、键顺序尽量原样保留。保存时按原文件的换行风格重新拼接。
- **源文件模式**：编辑器纸头的「表单 / 源文件」切换。源文件下一块编辑器就是仓库里的那份文件（frontmatter 围栏 + 正文），保存按输入原样写回：只按原文件风格还原 CRLF/LF 与 BOM，不解析 frontmatter、不改写键、不自动补 `updated`、不折叠结尾空行，所以能直接改引号、键顺序、注释、未知字段与缩进。从表单切过去时未保存的表单改动会先组合进源文本（表单里有无效字段则拒绝切换）；切回表单会重新解析源文本，YAML 损坏时落到「原文 textarea」降级编辑，YAML 不合法也仍允许保存（只给红色提示，博客构建可能失败）。
- **新建**：标题生成文件名（可手改），目录从现有文件夹中选择或直接输入；生成初始 frontmatter 后进入**本地草稿**。此时不会写仓库；盖章保存时才用 `create` 模板做唯一一次创建提交。刷新/直接打开链接不会创建空文件。
- **保存**：带上次读到的 blob sha 写入；远端已变化时返回 409，应用显示冲突对话框，不会静默覆盖。新建路径若在草稿期间被远端占用，保存会提示换路径并保留草稿。
- **移动**：读取旧 blob → 建新树 → 新提交（父提交为当前 HEAD）→ 更新分支 ref；一个提交完成，不会出现「先加后删」的中间状态。
- **删除**：创建一个删除提交；Git 历史仍可恢复。
- **提交消息占位符**：`{path}` 目标路径、`{title}` 文章标题（缺失时回退文件名去扩展名）、`{oldPath}`、`{newPath}`、`{dir}` 所在目录、`{name}` 不含扩展名、`{date}` 按设置时区、`{action}`。未知占位符保留原文并在设置页给出预览。

## 安全模型

- 令牌**只存在浏览器**：Setup 时用随机数据密钥加密，数据密钥再由设备指纹（或密码）派生的 KEK 包装；localStorage 里看不到明文 PAT。
- 设备指纹、localStorage 都不是秘密；**密码才是安全边界**。需要更强隔离时请设置密码并启用双因子。
- 解锁后的 PAT 只在内存里；锁定会清空内存、React Query 缓存和编辑会话。
- 预览用 DOMPurify 白名单净化；外链自动 `rel="noreferrer noopener"`；不加载第三方脚本、字体或 iframe。
- `HashRouter` + 纯静态托管；无后端、无 Cookie、无服务端日志。
- `.env.local` 只给 Node 测试用，已在 `.gitignore` 中；不要把真实 PAT 写进任何会被提交的文件。
- 建议部署时加 CSP（至少限制 `script-src 'self'`、`connect-src 'self' https://api.github.com`、`img-src 'self' data: https:`），并保持依赖更新。

## 测试

```bash
cp .env.example .env.local   # 填入测试 PAT / 仓库
pnpm test:seed               # 测试仓库为空时也能创建首个提交
pnpm test                    # 72 个单元测试（路径、frontmatter 字段、编码、vault、预览、批量读取）
pnpm test:live               # 7 个真实 GitHub 集成测试（会创建/移动/删除 src/_e2e/*，最后清理）
pnpm test:e2e                # 11 个 Playwright 测试（1 setup + 7 demo + 3 live；需 .env.local）
pnpm test:clean              # 兜底清理 src/_e2e/*
pnpm verify                  # typecheck + lint + unit + build
```

- 单元测试覆盖：排除规则、树模型、提交模板与 `{title}`、frontmatter 解析/回写/CRLF/注释保留、源文件模式整文件写回/EOL/BOM、字段定义/类型/必填/删除、源文件模式缺少必填提示、新稿初始文档、设置迁移、UTF-8 base64、vault 加解密与篡改检测、预览 XSS 净化、shoka 语法、GraphQL 批量读取/回退、全库 frontmatter 索引与限流。
- Live 测试覆盖：真实仓库读、批量读取（含 CJK 路径）、CRLF 写入/读回、创建/更新/过期 sha 冲突、删除、单提交移动、过期移动冲突、错误映射。
- E2E 覆盖：demo 工作台保存、dashboard 全库 frontmatter 排序、设置中增删字段并反映到编辑器、源文件模式改写整份文件后切回表单并保存、新稿本地起草后一次创建、`{title}` 提交模板；live 新稿保存前 404 → 保存后 1 个 commit（parent 校验）、dashboard 使用 1 次 GraphQL 批量且 0 次 summary contents、真实文件保存与回执。
- 测试结束请**轮换测试 token**；`.env.local` 不要提交。

**手动 E2E 清单**（或用 `pnpm test:e2e`，见下）：

1. `?demo=1` 打开工作台；展开索引、打开一篇笔记；改正文/标题；盖章保存；回工作台看提交小票。
2. 新建文章 → 检查目录、文件名、初始字段；确认此时仓库没有新文件；在编辑器盖章后才出现一次创建提交。
3. 设置 → 改提交模板/字号 → 保存；回工作台确认预览变化。
4. 真实模式：连接测试仓库 → 打开 `便笺-测试.md`（CRLF）→ 保存 → 回工作台看 GitHub 链接；在设置里锁定 → 重新加载 → 设备/密码解锁。
5. 移动/删除对话框；冲突场景（用 GitHub 网页端先改同一文件，再在应用里保存）。
6. 编辑器切到「源文件」→ 直接改 frontmatter 的引号/键顺序与正文 → 盖章 → 在 GitHub 看 diff 只有改动行、CRLF/BOM 保留；切回表单确认字段来自源文本；写入非法 YAML 时看到红色提示仍可保存。
7. 390px 视口：抽屉索引、编辑器、预览、设置；检查无横向滚动。

`pnpm test:e2e` 使用 Playwright，当前配置走系统 **Microsoft Edge**（`channel: 'msedge'`），不需要下载浏览器。若机器没有 Edge，可 `pnpm exec playwright install chromium` 并把 `playwright.config.ts` 里的 channel 改为 `'chromium'`。首次运行会在 `tests/e2e/.auth/` 生成一个本地加密保险库状态（已 gitignore），live 组会创建并清理 `src/_e2e/*`。

## 构建与部署

```bash
pnpm build     # dist/
pnpm preview   # http://localhost:4174
```

部署到任意静态托管即可（GitHub Pages / Cloudflare Pages / Netlify / Nginx）。使用 HashRouter，不需要 SPA 重写规则。如果部署在子路径，构建时设置 `STUDIO_BASE=/studio/`（Vite `base`）：

```bash
STUDIO_BASE=/studio/ pnpm build
```

> 项目已验证到 `dist` 构建与 `vite preview` 产物；生产域名的 DNS/TLS/CSP 由部署平台负责。

## 目录

```
astro-blog-studio/
├─ design/                 # 决策台 HTML、截图、方向契约
├─ docs/screenshots/       # 成品截图（demo fixture）
├─ scripts/                # 设计台构建、静态预览、测试仓库 seed/clean
├─ src/
│  ├─ components/          # AppShell、文件树、新建对话框、动态 frontmatter 表单、UI 原子
│  ├─ hooks/               # 数据查询、自动锁定
│  ├─ lib/
│  │  ├─ config/           # zod 设置 schema、默认值
│  │  ├─ demo/             # 演示数据
│  │  ├─ frontmatter/      # 字段定义/默认集/校验/新稿初始文档
│  │  ├─ gateway/          # GatewayProvider（live/demo）
│  │  ├─ github/           # LiveGateway（Octokit）、fixture、错误映射
│  │  ├─ markdown/         # frontmatter 文档模型、marked + DOMPurify 渲染
│  │  ├─ paths/            # 路径归一化、排除匹配、提交模板
│  │  ├─ tree/             # 文件树模型
│  │  ├─ utils/            # 日期、编码、cn
│  │  └─ vault/            # WebCrypto 加解密、设备指纹、会话、keystore
│  ├─ pages/               # 工作台、编辑器、设置、Setup、Unlock
│  ├─ stores/              # settings / vault / ui / rate-limit / editor guard / pending-post
│  └─ styles/              # Tailwind v4 tokens + abs-* 组件样式
├─ tests/
│  ├─ unit/                # Vitest 单元测试
│  ├─ live/                # 真实 GitHub 测试
│  └─ e2e/                 # Playwright
├─ AGENTS.md               # 本子项目的 agent 约束
├─ DESIGN.md               # 视觉/交互实现规范
├─ PRODUCT.md              # 产品事实与目标
└─ plan.md                 # 原始需求
```

## 已知限制

- 单文件编辑；没有图片上传、没有跨文件搜索（只搜路径）、没有版本历史 UI、没有 PR 流程。
- 冲突处理是「保留本地 / 覆盖远端 / 重新加载」，没有逐行 merge。
- 只支持 UTF-8 Markdown/MDX；二进制文件、超大文件会提示不支持。
- GitHub Contents API 单文件约 1 MB / 100 MB 仓库限制；分支保护、只读 token 会在写时返回 403 并提示。
- 设备指纹不是安全边界；共享电脑上请设置密码并启用双因子，或使用后锁定。
- 自动锁定只在有活动事件时重置计时；后台标签页的计时可能被浏览器节流。
- 产品路线：图片粘贴上传、命令面板、封面/日历视图、主题切换、PWA、离线草稿。

## 设计出处

- 方向决策：`design/directions.html`（4 个方向 × 5 个视图 + 对比板）
- 选定方向：`design/DECISION.md`（01 樱糖手帐，六段契约）
- 成品截图：`docs/screenshots/`（生产构建 + `?demo=1` 固定数据，2026-10-18）
- 实现规范：`DESIGN.md`

## License

GNU Affero General Public License v3.0（`AGPL-3.0-only`），见 [LICENSE](LICENSE)。与同仓库的 `astro-blog` 保持一致。

© 2026 God-2077
