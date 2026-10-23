[← 返回 README](../README.md)

# 架构、内容规则与 PWA

本文件承接 README 的目录结构、内容与提交规则、设置项，以及 PWA 与离线的完整细节。

## 目录结构

```text
astro-blog-studio/
├─ design/                 # 决策台 HTML、截图、方向契约
├─ docs/                   # 专题文档 + 成品截图
│  ├─ architecture.md      # 本文件：目录、内容与提交规则、设置项、PWA 与离线
│  ├─ backup.md            # 未保存备份的完整行为
│  ├─ content-cache.md     # 本机文章缓存与增量同步
│  ├─ testing.md           # 测试覆盖、手动 E2E、测试仓库
│  └─ screenshots/         # 成品截图（demo fixture）
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

## 内容与提交规则

- **可见文件**：根目录下、扩展名匹配、且不命中排除规则的文件。排除支持目录前缀与 glob（如 `src/content/blog/en`、`src/content/**/draft/**`）。
- **frontmatter**：编辑器表单由设置中的字段列表动态生成；字段类型、必填、增删都在设置页维护。只改表单里变化的键；未识别字段、注释行、键顺序尽量原样保留。保存时按原文件的换行风格重新拼接。
- **源文件模式**：编辑器纸头的「表单 / 源文件」切换。源文件下一块编辑器就是仓库里的那份文件（frontmatter 围栏 + 正文），保存按输入原样写回：只按原文件风格还原 CRLF/LF 与 BOM，不解析 frontmatter、不改写键、不自动补 `updated`、不折叠结尾空行，所以能直接改引号、键顺序、注释、未知字段与缩进。从表单切过去时未保存的表单改动会先组合进源文本（表单里有无效字段则拒绝切换）；切回表单会重新解析源文本，YAML 损坏时落到「原文 textarea」降级编辑，YAML 不合法也仍允许保存（只给红色提示，博客构建可能失败）。
- **新建**：标题生成文件名（可手改），目录从现有文件夹中选择或直接输入；生成初始 frontmatter 后进入**本地草稿**。此时不会写仓库；盖章保存时才用 `create` 模板做唯一一次创建提交。刷新/直接打开链接不会创建空文件；刷新后若本机有备份，进入编辑器会先提示恢复草稿。
- **未保存备份**：完整行为（加密、恢复弹窗、409、新稿、清除时机、设置开关）见 [backup.md](backup.md)。
- **保存**：带上次读到的 blob sha 写入；远端已变化时返回 409，应用显示冲突对话框，不会静默覆盖。新建路径若在草稿期间被远端占用，保存会提示换路径并保留草稿。
- **移动**：读取旧 blob → 建新树 → 新提交（父提交为当前 HEAD）→ 更新分支 ref；一个提交完成，不会出现「先加后删」的中间状态。
- **删除**：创建一个删除提交；Git 历史仍可恢复。
- **提交消息占位符**：`{path}` 目标路径、`{title}` 文章标题（缺失时回退文件名去扩展名）、`{oldPath}`、`{newPath}`、`{dir}` 所在目录、`{name}` 不含扩展名、`{date}` 按设置时区、`{action}`。未知占位符保留原文并在设置页给出预览。

## 设置项

- 根目录、扩展名、排除规则、时区、索引并发（1–10）、本机文章缓存（检查更新 / 强制全量更新）、Frontmatter 字段、提交模板、字号/行号、保存时更新 `updated`、未保存备份开关与清除、自动锁定、解锁方式（模式 + 密码）、重置保险库、外观（跟随系统 / 昼 / 夜）。
- 每个分区是可折叠面板：手机竖屏（<768px）首次进入全部折叠，平板/桌面（≥768px）首次进入全部展开；折叠时标题行仍显示摘要（缓存篇数、字段数与校验错误、当前主题、令牌状态）。展开状态只在会话内，刷新后重新按视口决定。

## PWA 与离线

- **可安装**：构建生成 `dist/manifest.webmanifest` 与 `dist/sw.js`；图标在 `public/`（`pnpm pwa:icons` 用零依赖脚本重画 `icon-192`、`icon-512`、`icon-maskable-512`、`apple-touch-icon`，生成结果要一起提交）。浏览器标签与 `apple-touch-icon` 统一使用 `/apple-touch-icon.png`。`pnpm dev` **不注册** Service Worker，PWA 只在 `pnpm build` + `pnpm preview` 或线上环境生效。
- **预缓存**：Service Worker 在 `window.load` 之后才注册，避免和首屏资源抢带宽；预缓存入口 HTML、JS/CSS、`woff2` 字体与图标（当前 50 条、约 2.3 MiB，构建日志会打印确切值），`.woff`/`.ttf` 只在旧浏览器需要时按需缓存。首访是后台安装，二次打开、弱网与断网打开都直接读缓存。
- **不缓存什么**：`api.github.com` 显式 `NetworkOnly`，私有内容与令牌语义都不会写进 CacheStorage。GitHub 的 REST 响应带 `Cache-Control: private, max-age=60`（未认证为 `public`），所以所有 GitHub 请求（Octokit REST 与 GraphQL）在 fetch 层强制 `cache: 'no-store'`，Service Worker 的 `NetworkOnly` 也设置 `fetchOptions.cache = 'no-store'`，避免浏览器 HTTP 缓存把旧 tree/blob 当成最新。离线时界面能开，但文件树与正文仍然需要联网。
- **更新提醒**：`sw.js` 内联了预缓存清单，任何构建产物变化都会让浏览器发现新版本；新 SW 进入 waiting 后弹出「网站有新版本」，点「立即刷新」才 reload，点「稍后」收起弹窗、顶栏保留带圆点的刷新按钮。检测时机是每 60s（仅页面可见且在线）+ 回到前台 / 窗口聚焦 / 网络恢复；弱网与离线时静默失败，不刷提示。
- **不会自动刷新**：只有用户点击才会整页刷新；编辑器有未保存修改时，现有的 `beforeunload` 还会再拦一次。
- **部署头**：`sw.js` 与 `index.html` 建议 `Cache-Control: no-cache`（浏览器对 SW 脚本本身会绕过 HTTP 缓存，但 CDN 边缘缓存仍可能拖慢更新）；`assets/*` 可以长缓存 + `immutable`。
- **子路径**：`STUDIO_BASE=/studio/ pnpm build` 会生成 `/studio/sw.js`、`/studio/manifest.webmanifest`，manifest 的 `scope`/`start_url` 与图标路径都跟着 base 走。

![更新提醒](../docs/screenshots/pwa-update.png)

### 更新提醒机制

- 首次访问当次不接管页面；多个标签页各自在下次导航时切换版本，不会互相强制刷新。
- 更新提示依赖 Service Worker 的更新机制：新 SW 进入 waiting 后才弹窗；「稍后」后顶栏保留带樱粉圆点的刷新按钮，可再次唤起弹窗。
- 只有用户点「立即刷新」才整页 reload；弱网/离线时静默失败，不刷提示；`pnpm dev` 不注册 SW，PWA 只在构建产物里可见。

## 相关文档

- [未保存备份](backup.md)
- [本机文章缓存与增量同步](content-cache.md)
- [测试覆盖、手动 E2E 与测试仓库](testing.md)
