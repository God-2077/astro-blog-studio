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
- **未保存备份**：编辑时约 600ms 防抖把整份文件快照写进本机 IndexedDB（同一文件只留最新一份），底栏显示「本机已备份 HH:mm」。真实仓库的备份用保险库数据密钥派生的子密钥加密，锁定后无法读取；demo 备份不加密。再次进入同一文件（含刷新后的 `new=1` 新稿）时检查备份并弹窗，提供「稍后 / 丢弃备份 / 恢复备份」；恢复已有文件保留原 blob sha，保存仍走 409 冲突；恢复新稿回到「未提交」，首次保存前不写仓库。保存、移动、删除成功后自动清除；设置里可关闭或清除本仓库备份。
- **frontmatter**：字段可在设置中增删；每个字段有名称、类型（`string / date / number / boolean / list`）和必填开关。默认预置 hello-world 常用字段（title、date、updated、description、categories、tags、draft、sticky、password、cover、keywords）；必填为空会阻止保存；未知字段原样保留；YAML 损坏时降级为原文编辑。
- **写操作**：新建、保存、删除、移动/重命名。新建先在本地起草，**第一次保存才创建文件，只调用一次创建 API**；移动用 Git Data API 在**一个提交**里完成；更新带 `sha` 乐观锁，冲突时弹出「重新加载 / 覆盖远端 / 取消」。
- **格式保真**：保留 CRLF / LF / BOM / 结尾换行；分块 base64 处理，避免大文件栈溢出；UTF-8 解码替换字符检测。
- **提交体验**：提交消息模板（`{path}`、`{title}`、`{oldPath}`、`{newPath}`、`{dir}`、`{name}`、`{date}`、`{action}`）；提交前确认；提交小票（sha、路径、时间、GitHub 链接）；API 配额显示。
- **本机加密文章缓存 + 增量同步**：首次打开用 GraphQL 按 20 篇 / 批把全库文章读一遍，连同 HEAD 文件树（tree sha + 路径/blob sha）一起用保险库数据密钥经 HKDF 派生的 AES-GCM 子密钥加密写入本机 IndexedDB；之后每次打开只拉一次 HEAD 文件树，在本地按「只在 HEAD 树 → 新增、同路径 blob sha 不同 → 修改、只在缓存 → 删除」比对，只重新读取新增/修改的文章并从缓存删除已删除的文章，未变化的仓库 **0 次文章内容请求**。Dashboard 顶部显示「首次加载 / 正在检查远端更新 / 正在同步文章」进度与「检查更新」按钮，设置里有「强制全量更新」。超过 1000 篇时只缓存前 1000 篇并提示；GraphQL 不可用时回退 Contents REST；并发数由设置里的「索引并发」控制（1–10，默认 3）。「最近动过」、草稿与加密计数仍基于全库，排序依据是 frontmatter 的 `updated` / `date`。
- **真实 / 演示双模式**：`?demo=1` 使用内存 fixture，不联网、不写仓库，适合评审 UI 和录屏。
- **外观 / 夜间模式**：默认跟随系统，也可在设置里固定为昼或夜；`<html data-theme>` 在首帧前由内联脚本应用，避免刷新白闪。夜间是暖墨纸与米白墨（不是反相、不用纯黑），CodeMirror、Markdown 预览、设置、解锁与移动端共用同一套 `--abs-*` token。
- **保险库**：PAT 以 AES-GCM-256 加密后写 localStorage；密钥由 PBKDF2-SHA256（600k 次）派生；三种解锁方式——设备指纹（FingerprintJS）自动解锁、密码、**密码 + 设备双因子**。双因子是严格的 AND：密码 KEK 混入设备指纹，payload 里不存独立设备包装，设备单独无法解锁；内存会话保存令牌与数据密钥，锁定清空。
- **设置**：根目录、扩展名、排除规则、时区、索引并发（1–10）、本机文章缓存（检查更新 / 强制全量更新）、Frontmatter 字段、提交模板、字号/行号、保存时更新 `updated`、未保存备份开关与清除、自动锁定、解锁方式（模式 + 密码）、重置保险库、外观（跟随系统 / 昼 / 夜）。
- **响应式**：桌面双栏、移动端抽屉索引；`prefers-reduced-motion` 降级。
- **PWA**：构建产物带 `manifest.webmanifest` 与 Service Worker，应用壳（HTML/JS/CSS/字体/图标）预缓存，第二次打开与弱网/断网打开都不等网络；检测到新部署时弹窗提示刷新（不自动刷新）。详见 [PWA 与离线](#pwa-与离线)。

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
3. 选择解锁方式（三选一）：
   - **设备指纹**：刷新后自动解锁；
   - **密码**：每次新标签页输入密码，不绑定设备；
   - **密码 + 设备双因子**：密码与本机指纹必须同时匹配，任一丢失都只能重置保险库并重新输入 PAT（真实仓库的本机备份也会一并清除）。
4. 连接成功后打开工作台；点索引卡里的文件进入编辑器。

测试仓库 `God-2077/astro-blog-content-test` 已在开发时用 `pnpm test:seed` 写入种子文件；空仓库也能连接，但文件树会提示「仓库是空的，请先创建一次初始提交」。

## 内容与提交规则

- **可见文件**：根目录下、扩展名匹配、且不命中排除规则的文件。排除支持目录前缀与 glob（如 `src/content/blog/en`、`src/content/**/draft/**`）。
- **frontmatter**：编辑器表单由设置中的字段列表动态生成；字段类型、必填、增删都在设置页维护。只改表单里变化的键；未识别字段、注释行、键顺序尽量原样保留。保存时按原文件的换行风格重新拼接。
- **源文件模式**：编辑器纸头的「表单 / 源文件」切换。源文件下一块编辑器就是仓库里的那份文件（frontmatter 围栏 + 正文），保存按输入原样写回：只按原文件风格还原 CRLF/LF 与 BOM，不解析 frontmatter、不改写键、不自动补 `updated`、不折叠结尾空行，所以能直接改引号、键顺序、注释、未知字段与缩进。从表单切过去时未保存的表单改动会先组合进源文本（表单里有无效字段则拒绝切换）；切回表单会重新解析源文本，YAML 损坏时落到「原文 textarea」降级编辑，YAML 不合法也仍允许保存（只给红色提示，博客构建可能失败）。
- **新建**：标题生成文件名（可手改），目录从现有文件夹中选择或直接输入；生成初始 frontmatter 后进入**本地草稿**。此时不会写仓库；盖章保存时才用 `create` 模板做唯一一次创建提交。刷新/直接打开链接不会创建空文件；刷新后若本机有备份，进入编辑器会先提示恢复草稿。
- **未保存备份**：编辑器只在本机保存最新一份草稿，按「模式 + 仓库 + 分支 + 路径」隔离；同一文件多次编辑只保留最后一次。真实仓库的草稿在用 AES-GCM 加密后写入 IndexedDB（密钥由保险库数据密钥经 HKDF 派生），明文只存在于内存；demo 仓库没有保险库，备份保持明文。进入编辑器时只检查一次：有备份就弹窗（显示保存时间、字数、路径；远端已变化会额外提示），没有就正常打开。选择「稍后」会保留备份并在文件头显示恢复条，这期间自动备份暂停，避免覆盖旧草稿。锁定前会先把当前草稿 flush 成本机加密备份，再清空密钥；重置保险库会删除本机所有真实仓库备份。恢复已有文件后保存仍使用备份里的 blob sha，远端变化会触发既有 409 冲突；恢复新稿后仍是本地草稿，首次保存才创建文件。多标签页编辑同一文件时，后写入的备份胜出，不做合并。
- **保存**：带上次读到的 blob sha 写入；远端已变化时返回 409，应用显示冲突对话框，不会静默覆盖。新建路径若在草稿期间被远端占用，保存会提示换路径并保留草稿。
- **移动**：读取旧 blob → 建新树 → 新提交（父提交为当前 HEAD）→ 更新分支 ref；一个提交完成，不会出现「先加后删」的中间状态。
- **删除**：创建一个删除提交；Git 历史仍可恢复。
- **提交消息占位符**：`{path}` 目标路径、`{title}` 文章标题（缺失时回退文件名去扩展名）、`{oldPath}`、`{newPath}`、`{dir}` 所在目录、`{name}` 不含扩展名、`{date}` 按设置时区、`{action}`。未知占位符保留原文并在设置页给出预览。

## 安全模型

- 令牌**只存在浏览器**：Setup 时用随机数据密钥加密，数据密钥再由设备指纹（或密码）派生的 KEK 包装；localStorage 里看不到明文 PAT。
- 设备指纹、localStorage 都不是秘密；**密码才是安全边界**。需要更强隔离时选择「密码 + 设备双因子」。
- **双因子是 AND**：密码 KEK 由「密码 + 本机指纹」共同派生，payload 中不存在独立的设备包装，所以设备单独无法解锁，解锁页也不会提供设备捷径。代价是换设备、清除站点数据或指纹变化后无法找回，只能重置保险库重新输入 PAT。
- 解锁后的 PAT 与数据密钥只在内存里；锁定会先把未保存草稿 flush 成加密备份，再清空会话密钥、备份内存与 React Query 缓存。
- **真实仓库的未保存备份是密文**：整份草稿（正文 + frontmatter + 恢复状态）用保险库数据密钥经 HKDF 派生的 AES-GCM 子密钥加密后写入本机 IndexedDB（键含模式/仓库/分支/路径）；不包含 PAT，不上传，也不进入 Service Worker 缓存。仓库/分支/路径与保存时间仍作为索引元数据明文。demo 模式没有保险库，备份为明文。锁定后读不到备份；重置保险库会删除本机所有真实仓库备份；浏览器清站点数据也会一并清除。
- **本机文章缓存也是密文**：索引 meta（tree sha + 路径/blob sha）和每篇文章（路径 + sha + 正文）分别用保险库数据密钥经 HKDF 派生的 AES-GCM 子密钥加密后写在本机 IndexedDB `abs-content`；AAD 绑定仓库/分支/路径/blob sha，换仓库或换 sha 都解不开。锁定会清空内存中的明文摘要，重置保险库会删除本机所有 `live:` 文章缓存；缓存不进 CacheStorage，也不含 PAT。demo 仓库只在内存里缓存，刷新回到 fixture。
- 预览用 DOMPurify 白名单净化；外链自动 `rel="noreferrer noopener"`；不加载第三方脚本、字体或 iframe。
- `HashRouter` + 纯静态托管；无后端、无 Cookie、无服务端日志。
- `.env.local` 只给 Node 测试用，已在 `.gitignore` 中；不要把真实 PAT 写进任何会被提交的文件。
- 建议部署时加 CSP（至少限制 `script-src 'self'`、`connect-src 'self' https://api.github.com`、`img-src 'self' data: https:`、`worker-src 'self'`、`manifest-src 'self'`），并保持依赖更新。

## PWA 与离线

- **可安装**：构建生成 `dist/manifest.webmanifest` 与 `dist/sw.js`；图标在 `public/`（`pnpm pwa:icons` 用零依赖脚本重画 `icon-192`、`icon-512`、`icon-maskable-512`、`apple-touch-icon`，生成结果要一起提交）。`pnpm dev` **不注册** Service Worker，PWA 只在 `pnpm build` + `pnpm preview` 或线上环境生效。
- **预缓存**：Service Worker 在 `window.load` 之后才注册，避免和首屏资源抢带宽；预缓存入口 HTML、JS/CSS、`woff2` 字体与图标（当前 50 条、约 2.3 MiB，构建日志会打印确切值），`.woff`/`.ttf` 只在旧浏览器需要时按需缓存。首访是后台安装，二次打开、弱网与断网打开都直接读缓存。
- **不缓存什么**：`api.github.com` 显式 `NetworkOnly`，私有内容与令牌语义都不会写进 CacheStorage。离线时界面能开，但文件树与正文仍然需要联网。
- **更新提醒**：`sw.js` 内联了预缓存清单，任何构建产物变化都会让浏览器发现新版本；新 SW 进入 waiting 后弹出「网站有新版本」，点「立即刷新」才 reload，点「稍后」收起弹窗、顶栏保留带圆点的刷新按钮。检测时机是每 60s（仅页面可见且在线）+ 回到前台 / 窗口聚焦 / 网络恢复；弱网与离线时静默失败，不刷提示。
- **不会自动刷新**：只有用户点击才会整页刷新；编辑器有未保存修改时，现有的 `beforeunload` 还会再拦一次。
- **部署头**：`sw.js` 与 `index.html` 建议 `Cache-Control: no-cache`（浏览器对 SW 脚本本身会绕过 HTTP 缓存，但 CDN 边缘缓存仍可能拖慢更新）；`assets/*` 可以长缓存 + `immutable`。
- **子路径**：`STUDIO_BASE=/studio/ pnpm build` 会生成 `/studio/sw.js`、`/studio/manifest.webmanifest`，manifest 的 `scope`/`start_url` 与图标路径都跟着 base 走。

![更新提醒](docs/screenshots/pwa-update.png)

## 测试

```bash
cp .env.example .env.local   # 填入测试 PAT / 仓库
pnpm test:seed               # 测试仓库为空时也能创建首个提交
pnpm test                    # 150 个单元测试（路径、frontmatter 字段、编码、vault 模式/双因子、备份加密、预览、批量读取、本机文章缓存与增量 diff/同步、更新轮询、未保存备份）
pnpm test:live               # 8 个真实 GitHub 集成测试（会创建/移动/删除 src/_e2e/*，最后清理）
pnpm test:e2e                # 20 个 Playwright 测试（1 setup + 12 demo + 4 live + 3 PWA；live 需 .env.local）
pnpm test:e2e:pwa            # 只跑 PWA 组（会先 vite build 再 vite preview）
pnpm pwa:icons               # 重新生成 public/icon-*.png（零依赖脚本）
pnpm test:clean              # 兜底清理 src/_e2e/*
pnpm verify                  # typecheck + lint + unit + build
```

- 单元测试覆盖：排除规则、树模型、提交模板与 `{title}`、frontmatter 解析/回写/CRLF/注释保留、源文件模式整文件写回/EOL/BOM、字段定义/类型/必填/删除、源文件模式缺少必填提示、新稿初始文档、设置迁移、UTF-8 base64、vault 三种解锁模式（双因子无设备包装、换设备失败、rewrap 复用数据密钥）、备份加密信封/篡改/换槽/锁定拒写/旧明文迁移、预览 XSS 净化、shoka 语法、GraphQL 批量读取/回退、本机文章缓存（路径/sha diff、AAD 绑定、锁定拒读、IDB 密文、跨仓库前缀清理、首次全量/未变化零读取/只读变更/失败重试/截断不删/配置签名变化/forceFull/并发/写入降级）、更新检查的节流/并发/失败静默、未保存备份的校验/快照/恢复映射/IndexedDB 上限/防抖与卸载清理/锁定前 flush。
- Live 测试覆盖：真实仓库读、批量读取（含 CJK 路径）、CRLF 写入/读回、创建/更新/过期 sha 冲突、删除、单提交移动、过期移动冲突、错误映射；真实的「首次全量 → 同树 unchanged 0 读取 → 远端新增 1 篇后只读该 blob」增量同步。
- E2E 覆盖：demo 工作台保存（含 toast X 关闭）、dashboard 全库 frontmatter 排序、设置中增删字段并反映到编辑器、源文件模式改写整份文件后切回表单并保存、新稿本地起草后一次创建、`{title}` 提交模板、未保存备份的表单/源文件恢复、稍后恢复条、丢弃后不再提示、新稿刷新恢复；live 首访 1 次 tree + 1 次 GraphQL 批量、刷新后 0 次文章内容请求且 `abs-content` 中只有 AES-GCM 信封、新稿保存前 404 → 保存后 1 个 commit（parent 校验）、真实文件保存与回执、未保存草稿在 IDB 中是密文且锁定/解锁后可恢复；PWA 组验证 manifest/图标/SW 注册、断网从预缓存打开且 CacheStorage 里没有 `api.github.com`、新版本 waiting 时弹窗 → 「稍后」→ 顶栏徽标 → 「立即刷新」才 reload。
- 测试结束请**轮换测试 token**；`.env.local` 不要提交。

**手动 E2E 清单**（或用 `pnpm test:e2e`，见下）：

1. `?demo=1` 打开工作台；展开索引、打开一篇笔记；改正文/标题；盖章保存；回工作台看提交小票。
2. 新建文章 → 检查目录、文件名、初始字段；确认此时仓库没有新文件；在编辑器盖章后才出现一次创建提交。
3. 设置 → 改提交模板/字号 → 保存；回工作台确认预览变化。
4. 真实模式：连接测试仓库 → 打开 `便笺-测试.md`（CRLF）→ 保存 → 回工作台看 GitHub 链接；在设置里锁定 → 重新加载 → 设备/密码解锁。用「密码 + 设备双因子」时确认刷新后必须输密码且不会自动解锁。
5. 移动/删除对话框；冲突场景（用 GitHub 网页端先改同一文件，再在应用里保存）。
6. 编辑器切到「源文件」→ 直接改 frontmatter 的引号/键顺序与正文 → 盖章 → 在 GitHub 看 diff 只有改动行、CRLF/BOM 保留；切回表单确认字段来自源文本；写入非法 YAML 时看到红色提示仍可保存。
7. 390px 视口：抽屉索引、编辑器、预览、设置；检查无横向滚动。
8. PWA：`pnpm build && pnpm preview` → 等 SW 安装完 → DevTools 切 Offline 刷新仍能开工作台；改一行 `dist/sw.js` 后 `registration.update()` → 弹窗出现 → 「稍后」看顶栏徽标 → 「立即刷新」；Edge/Chrome 地址栏可出现「安装」。
9. 未保存备份：改标题/正文或「源文件」内容 → 底栏出现「本机已备份」→ 刷新 → 弹窗「发现未保存的备份」→「稍后」出现恢复条 →「恢复」→ 内容回来且仍是「未保存」；再刷新 →「丢弃备份」→ 回到远端内容且不再弹窗。新稿同样刷新后恢复；保存/移动/删除后确认不再提示；设置里关闭备份并清除本仓库备份。
10. 加密备份：真实仓库里改标题 → `本机已备份` → DevTools → Application → IndexedDB → `abs-backups`，确认值是 `v: 2` 信封且搜不到文章标题/正文 → 顶栏锁定 → 输密码解锁 → 打开同一文件 → 恢复提示出现并能恢复；设置里“重置保险库”后确认本机真实仓库备份已清除。
11. 本机文章缓存：真实仓库首次打开看到「首次加载 · 正在读取全部文章」→ 解锁后刷新，Dashboard 只显示「正在检查远端更新…」且 Network 里没有 GraphQL 内容请求；DevTools → IndexedDB → `abs-content` 只有 `v: 1` 信封、搜不到标题/正文；在 GitHub 网页改/删/加一篇后点「检查更新」只读取变更；设置「强制全量更新」重新读取并显示进度；锁定 → 解锁后仍能直接看到列表；重置保险库后 `abs-content` 的 `live:` 记录被清空。

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

> 项目已验证到 `dist` 构建与 `vite preview` 产物；生产域名的 DNS/TLS/CSP 由部署平台负责。构建会额外产出 `dist/sw.js`、`dist/manifest.webmanifest` 与 `dist/icon-*.png`（PWA），部署时把它们和 `dist/index.html` 一起发布即可；缓存与 CSP 头的要求见 [PWA 与离线](#pwa-与离线)。

## 目录

```
astro-blog-studio/
├─ design/                 # 决策台 HTML、截图、方向契约
├─ docs/screenshots/       # 成品截图（demo fixture）
├─ public/                 # robots.txt + PWA 图标（pnpm pwa:icons 生成）
├─ scripts/                # 设计台构建、静态预览、PWA 图标生成、测试仓库 seed/clean
├─ src/
│  ├─ components/          # AppShell、文件树、新建对话框、动态 frontmatter 表单、备份恢复弹窗、PWA 更新弹窗、UI 原子
│  ├─ hooks/               # 数据查询、本机文章缓存同步、自动锁定、未保存备份
│  ├─ lib/
│  │  ├─ backup/           # 备份记录校验、整文件快照、AES-GCM 信封、IndexedDB 存放/清理/迁移
│  │  ├─ content/          # 本机文章缓存：model/diff/envelope/同步/IndexedDB 加密存储
│  │  ├─ config/           # zod 设置 schema、默认值
│  │  ├─ demo/             # 演示数据
│  │  ├─ frontmatter/      # 字段定义/默认集/校验/新稿初始文档
│  │  ├─ gateway/          # GatewayProvider（live/demo）
│  │  ├─ github/           # LiveGateway（Octokit）、fixture、错误映射
│  │  ├─ markdown/         # frontmatter 文档模型、marked + DOMPurify 渲染
│  │  ├─ paths/            # 路径归一化、排除匹配、提交模板
│  │  ├─ pwa/              # 版本检测（节流/可见性/在线状态）
│  │  ├─ tree/             # 文件树模型
│  │  ├─ utils/            # 日期、编码、cn
│  │  └─ vault/            # WebCrypto 加解密、HKDF 备份子密钥、设备指纹、会话、三种解锁模式的 keystore
│  ├─ pages/               # 工作台、编辑器、设置、Setup、Unlock
│  ├─ stores/              # settings / vault / content / ui / rate-limit / editor guard / pending-post / pwa
│  └─ styles/              # Tailwind v4 tokens + abs-* 组件样式
├─ tests/
│  ├─ unit/                # Vitest 单元测试
│  ├─ live/                # 真实 GitHub 测试
│  └─ e2e/                 # Playwright（demo / live / pwa）
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
- 设备指纹不是安全边界；共享电脑上请选「密码」或「密码 + 设备双因子」，或使用后锁定。双因子下密码与指纹必须同时匹配，任一丢失只能重置保险库。
- 自动锁定只在有活动事件时重置计时；后台标签页的计时可能被浏览器节流。
- 未保存备份只在本机：真实仓库的备份是密文、只能在解锁后读取；换设备/换浏览器不会同步；同一文件多标签页编辑时最后写入者胜出，不做合并；重置保险库或清除站点数据会一并清除。
- 本机文章缓存也按「设备 + 浏览器 + 仓库 + 分支 + 内容配置」独立：换设备、清除站点数据、修改根目录/扩展名/排除规则后，首次打开会重新全量读取；多标签页各自同步，最后写入的 meta 胜出（最坏多读几次，不会损坏数据）。
- 离线只缓存前端：断网能打开界面，已缓存的文章列表仍可见；但 HEAD 文件树、编辑器正文与提交仍要连 `api.github.com`，未保存备份能在本机恢复但断网刷新后仍无法读取文件正文，不是完整的离线编辑；没有离线保存队列。
- 更新提示依赖 Service Worker 的更新机制：首次访问当次不接管页面；多个标签页各自在下次导航时切换版本，不会互相强制刷新。
- 产品路线：图片粘贴上传、命令面板、封面/日历视图、离线编辑与保存队列、主题切换的扩展预设。

## 设计出处

- 方向决策：`design/directions.html`（4 个方向 × 5 个视图 + 对比板）
- 选定方向：`design/DECISION.md`（01 樱糖手帐，六段契约）
- 成品截图：`docs/screenshots/`（生产构建 + `?demo=1` 固定数据，2026-10-18）
- 实现规范：`DESIGN.md`

## License

GNU Affero General Public License v3.0（`AGPL-3.0-only`），见 [LICENSE](LICENSE)。与同仓库的 `astro-blog` 保持一致。

© 2026 God-2077
