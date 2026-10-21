# Astro Blog Studio 使用指南

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

测试仓库与种子数据见 [docs/testing.md](testing.md)。空仓库也能连接，但文件树会提示「仓库是空的，请先创建一次初始提交」。

## 功能

- **文件索引**：树形浏览、路径搜索、排除规则过滤与刷新；显示目录内 Markdown 数量和被排除数量。
- **编辑**：CodeMirror 6 Markdown 编辑 + 实时预览；表单按 frontmatter 字段编辑，源文件模式直接编辑整份文件（含 frontmatter）并原样写回。GFM、表格、代码块（预览内置语言高亮，未知语言纯文本）、KaTeX 数学、剧透 `!!x!!`、高亮 `==x==`、插入 `++x++`、ruby、`:::info` 容器、`<!-- more -->` 摘要分隔。[详细规则](architecture.md#内容与提交规则)
- **未保存备份**：编辑时约 600ms 防抖把整份文件快照写入本机 IndexedDB（同一文件只留最新一份），底栏显示「本机已备份 HH:mm」；真实仓库加密、demo 明文。进入编辑器时提示恢复；保存/移动/删除后清除，设置可关闭或清除。[完整行为](backup.md)
- **草稿箱**：编辑器「保存草稿」把当前完整编辑状态写入本机（真实仓库 AES-GCM 加密），工作台「草稿箱」按钮切换本机草稿列表；**未保存的自动备份也会作为草稿列出来**，同一路径显示较新的一份，可同时保留多篇、从草稿箱打开继续编辑或删除；新稿开始下一篇前会先把上一篇存入草稿箱。只写 IndexedDB，不产生 GitHub 请求。[完整行为](drafts.md)
- **frontmatter**：字段可在设置中增删，支持 `string / date / number / boolean / list` 与必填；默认预置 hello-world 常用字段（title、date、updated、description、categories、tags、draft、sticky、password、cover、keywords）。必填为空阻止保存；未知字段原样保留；YAML 损坏时降级原文编辑。
- **写操作**：新建、保存、删除、移动/重命名；新稿先在本地起草，第一次保存才创建文件且只调用一次创建 API；移动用 Git Data API 在一个提交里完成；更新带 `sha` 乐观锁，冲突时弹出「重新加载 / 覆盖远端 / 取消」。[详细规则](architecture.md#内容与提交规则)
- **格式保真**：保留 CRLF / LF / BOM / 结尾换行；分块 base64 处理避免大文件栈溢出；UTF-8 解码替换字符检测。
- **提交体验**：提交消息模板（`{path}`、`{title}`、`{oldPath}`、`{newPath}`、`{dir}`、`{name}`、`{date}`、`{action}`）、提交前确认、提交小票（sha、路径、时间、GitHub 链接）、API 配额显示。[详细规则](architecture.md#内容与提交规则)
- **本机加密文章缓存 + 增量同步**：首次打开用 GraphQL 按 20 篇 / 批读取全库，用保险库数据密钥经 HKDF 派生的 AES-GCM 子密钥加密写入本机 IndexedDB；之后只拉 HEAD 文件树，按路径 + blob sha 只读新增/修改并删除已删文章，未变化 **0 次文章内容请求**。Dashboard 显示首次加载/检查/同步进度（进行中即时反馈），「最近动过」可切换 `updated` / `date` 排序并每次「加载更多」20 篇。[完整行为](content-cache.md)
- **真实 / 演示双模式**：`?demo=1` 使用内存 fixture，不联网、不写仓库，适合评审 UI 和录屏。
- **外观 / 夜间模式**：默认跟随系统，也可固定为昼或夜；`<html data-theme>` 在首帧前由内联脚本应用，避免刷新白闪。夜间是暖墨纸与米白墨（不是反相、不用纯黑），CodeMirror、Markdown 预览、设置、解锁与移动端共用同一套 `--abs-*` token。
- **保险库**：PAT 以 AES-GCM-256 加密后写 localStorage；密钥由 PBKDF2-SHA256（600k 次）派生；三种解锁方式——设备指纹（FingerprintJS）自动解锁、密码、**密码 + 设备双因子**。双因子是严格 AND：密码 KEK 混入设备指纹，payload 里不存独立设备包装，设备单独无法解锁；内存会话保存令牌与数据密钥，锁定清空。
- **设置**：覆盖内容、本机缓存、Frontmatter 字段、提交模板、编辑器、未保存备份、安全解锁与外观；每个分区可折叠（手机 <768px 默认折叠、宽屏默认展开）。[设置项清单](architecture.md#设置项)
- **响应式**：桌面双栏、移动端抽屉索引；`prefers-reduced-motion` 降级。
- **PWA**：构建产物带 `manifest.webmanifest` 与 Service Worker，应用壳（HTML/JS/CSS/字体/图标）预缓存，第二次打开与弱网/断网打开都不等网络；检测到新部署时弹窗提示刷新（不自动刷新）；浏览器标签与 `apple-touch-icon` 统一使用 `/apple-touch-icon.png`。[PWA 与离线](architecture.md#pwa-与离线)

## 安全模型

- **令牌只存在浏览器**：Setup 用随机数据密钥加密，数据密钥再由设备指纹（或密码）派生的 KEK 包装；PAT 以 AES-GCM-256 写入 localStorage，密钥由 PBKDF2-SHA256（600k 次）派生；localStorage 里看不到明文 PAT。
- **密码才是安全边界**：设备指纹、localStorage 都不是秘密；需要更强隔离时选择「密码 + 设备双因子」。双因子是 AND：密码 KEK 由「密码 + 本机指纹」共同派生，payload 中不存在独立的设备包装，所以设备单独无法解锁，解锁页也不会提供设备捷径；代价是换设备、清除站点数据或指纹变化后无法找回，只能重置保险库重新输入 PAT。
- **会话与锁定**：解锁后的 PAT 与数据密钥只在内存里；锁定会先把未保存草稿 flush 成加密备份，再清空会话密钥、备份内存与 React Query 缓存。
- **真实仓库的未保存备份是密文**：整份草稿（正文 + frontmatter + 恢复状态）用保险库数据密钥经 HKDF 派生的 AES-GCM 子密钥加密后写入本机 IndexedDB（键含模式/仓库/分支/路径）；不包含 PAT，不上传，也不进入 Service Worker 缓存。仓库/分支/路径与保存时间仍作为索引元数据明文。demo 模式没有保险库，备份为明文。锁定后读不到备份；重置保险库会删除本机所有真实仓库备份；浏览器清站点数据也会一并清除。[完整行为](backup.md)
- **真实仓库的草稿箱同样是密文**：草稿记录用独立的 HKDF 子密钥（`abs:draft:v1`）加密，AAD 绑定仓库/分支/路径、保存时间与大小；锁定即丢弃内存明文，重置保险库会清除真实仓库草稿。[完整行为](drafts.md)
- **本机文章缓存也是密文**：索引 meta（tree sha + 路径/blob sha）和每篇文章（路径 + sha + 正文）分别用保险库数据密钥经 HKDF 派生的 AES-GCM 子密钥加密后写在本机 IndexedDB `abs-content`；AAD 绑定仓库/分支/路径/blob sha，换仓库或换 sha 都解不开。锁定会清空内存中的明文摘要，重置保险库会删除本机所有 `live:` 文章缓存；缓存不进 CacheStorage，也不含 PAT。demo 仓库只在内存里缓存，刷新回到 fixture。[完整行为](content-cache.md)
- **渲染、运行时与配置**：预览用 DOMPurify 白名单净化；外链自动 `rel="noreferrer noopener"`；不加载第三方脚本、字体或 iframe。`HashRouter` + 纯静态托管；无后端、无 Cookie、无服务端日志。`.env.local` 只给 Node 测试用，已在 `.gitignore` 中；不要把真实 PAT 写进任何会被提交的文件。建议部署时加 CSP（至少限制 `script-src 'self'`、`connect-src 'self' https://api.github.com`、`img-src 'self' data: https:`、`worker-src 'self'`、`manifest-src 'self'`），并保持依赖更新。

## 已知限制

- 单文件编辑；没有图片上传、没有跨文件搜索（只搜路径）、没有版本历史 UI、没有 PR 流程。
- 冲突处理是「保留本地 / 覆盖远端 / 重新加载」，没有逐行 merge。
- 只支持 UTF-8 Markdown/MDX；二进制文件、超大文件会提示不支持。
- GitHub Contents API 单文件约 1 MB / 100 MB 仓库限制；分支保护、只读 token 会在写时返回 403 并提示。
- 设备指纹不是安全边界；共享电脑上请选「密码」或「密码 + 设备双因子」，或使用后锁定。双因子下密码与指纹必须同时匹配，任一丢失只能重置保险库。
- 自动锁定只在有活动事件时重置计时；后台标签页的计时可能被浏览器节流。
- 未保存备份只在本机：真实仓库的备份是密文、只能在解锁后读取；换设备/换浏览器不会同步；同一文件多标签页编辑时最后写入者胜出，不做合并；重置保险库或清除站点数据会一并清除。
- 草稿箱也只在本机、不在设备间同步；同一路径只保留一份草稿；已有文章的远端被删除后，草稿仍在但需要先恢复文件才能再次保存。
- 本机文章缓存也按「设备 + 浏览器 + 仓库 + 分支 + 内容配置」独立：换设备、清除站点数据、修改根目录/扩展名/排除规则后，首次打开会重新全量读取；多标签页各自同步，最后写入的 meta 胜出（最坏多读几次，不会损坏数据）。
- 离线只缓存前端：断网能打开界面，已缓存的文章列表仍可见；但 HEAD 文件树、编辑器正文与提交仍要连 `api.github.com`，未保存备份能在本机恢复但断网刷新后仍无法读取文件正文，不是完整的离线编辑；没有离线保存队列。
- 更新提示依赖 Service Worker 的更新机制：首次访问当次不接管页面；多个标签页各自在下次导航时切换版本，不会互相强制刷新。
- 产品路线：图片粘贴上传、命令面板、封面/日历视图、离线编辑与保存队列、主题切换的扩展预设。
