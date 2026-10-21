# DESIGN.md — Astro Blog Studio

实现层的设计规范。方向选择与决策过程见 [`design/DECISION.md`](design/DECISION.md)，完整原型见 [`design/directions.html`](design/directions.html)。

## 方向契约（来自 DECISION.md）

**THESIS** — 把博客编辑做成一张摊在桌上的手帐纸：文件是索引卡，编辑是纸，提交是盖章。拒绝通用仪表盘的卡片网格，也拒绝把可爱做成噪音。

**OWN-WORLD** — 暖纸、桌面、腮红、樱、薄荷、黄油、墨；1.5–2px 墨线、18–22px 圆角、3–6px 硬偏移阴影、纸胶带、索引卡、圆形印章。展示面圆体、正文系统中文、数据等宽。编辑器内部无纹理、无描边、无旋转。

**STORY** — 打开就知道今天改哪张卡；点开文件像抽出一张纸；改完盖章，收到一张提交小票；出错时知道下一步，而不是等一个通用错误弹窗。

**FIRST VIEWPORT** — 左侧索引卡，中间「今天写点什么」+ 三张便签统计 + 最近清单，右侧提交小票、今日小目标、API 状态；唯一的实心樱粉按钮是「新建文章」。编辑区是整块安静的白纸，印章是唯一的红。

**FORM** — 手帐 / 索引卡系统，四方向中的 01。`seed: none (unavailable)`：impeccable context 加载器在本机挂起，按降级流程手工推导 PRODUCT.md / BRIEF.md。

**FINISH** — unreviewed and undocumented is unfinished。本实现以两轮截图检查、真机浏览器验证、`DESIGN.md` 与该 verdict 收尾。

## 颜色 token（`src/styles/app.css`）

颜色是**两套值、同一组变量名**：`--abs-*` 在 `:root` 里是昼，`:root[data-theme='night']` 覆盖为夜；组件只读变量，不写主题分支。夜间是暖墨桌面 + 深栗纸 + 米白墨，不是反相，也不使用纯黑纸面。

| Token | 昼 | 夜 | 用途 |
|---|---|---|---|
| `--abs-paper` | `#FFFBF5` | `#2A2025` | 纸面、卡片、编辑区 |
| `--abs-paper-2` | `#FFF6EC` | `#32272C` | 次级纸面、演示条 |
| `--abs-desk` | `#F6EDE6` | `#100B0E` | 桌面背景（+ 22px 点阵） |
| `--abs-blush` / `--abs-blush-2` | `#F7DDE5` / `#FBE9EF` | `#3E2B33` / `#32252B` | 腮红块、选中、加密徽章、hover |
| `--abs-sakura` | `#C93F6D` | `#F07CA3` | 主操作、印章、链接 |
| `--abs-sakura-deep` / `--abs-sakura-soft` | `#AD305C` / `#E85D8A` | `#FF9DBD` / `#FFB3CC` | hover / 深强调 |
| `--abs-mint` / `--abs-mint-2` | `#A8E0CF` / `#DDF4EC` | `#8FDCC4` / `#204039` | 成功、进度、勾选 |
| `--abs-butter` / `--abs-butter-2` | `#FFE9AE` / `#FFF3D1` | `#443319` / `#2E2513` | 提示、草稿、今日便签 |
| `--abs-ink` | `#3D2F36` | `#F2E6DE` | 主文字 |
| `--abs-ink-soft` | `#6B5A61` | `#CFBDB5` | 次级文字 |
| `--abs-muted` | `#7A686E` | `#B3A19A` | 辅助文字、编号 |
| `--abs-line` / `--abs-line-soft` | `#D9C6BF` / `#EADAD3` | `#55434A` / `#403237` | 实线 / 虚线 |
| `--abs-edge` | `#3D2F36` | `#806970` | 1.5px 纸边（原写死 ink） |
| `--abs-input-line` / `--abs-input-bg` | `#D9C6BF` / `#FFFBF5` | `#8F7A82` / `#1E171A` | 输入框边框 / 底色 |
| `--abs-success` / `--abs-warning` / `--abs-danger` | `#2F6B58` / `#7A5B16` / `#B23A4E` | `#93DEC9` / `#E9C97F` / `#FF8F7C` | 状态；夜间 danger 偏橙红，与品牌粉分开 |
| `--abs-focus` | `#A8496B` | `#FFA8C6` | `:focus-visible` |
| `--abs-code-bg` / `--abs-code-fg` | `#2F2A2E` / `#F3E6EA` | `#171114` / `#EFE4DC` | 预览代码块（夜间是更深的「墨池」） |
| `--abs-on-accent` / `--abs-on-danger` | `#FFFFFF` | `#241016` / `#2A1114` | 实心粉 / 红按钮上的文字 |

Markdown 源码语法色是一组**角色别名**，底层继续沿用上面的昼/夜 token，不复制第二套颜色；CodeMirror 样式只引用这些角色：

| 角色 token | 映射 | 用途 |
|---|---|---|
| `--abs-md-heading` | `--abs-ink` | 标题、表格表头 |
| `--abs-md-link` | `--abs-sakura-deep` | 链接文字、URL |
| `--abs-md-code` | `--abs-success` | 行内代码、代码块、任务标记、代码语言名 |
| `--abs-md-string` | `--abs-warning` | 链接标题、实体/emoji、转义 |
| `--abs-md-muted` | `--abs-ink-soft` | 引用、注释、Markdown 标点 |
| `--abs-md-rule` | `--abs-sakura-deep` | `---` / `***` / `___` 分割线 |

细节 token：`--abs-stamp*`（印泥颜色与描边环）、`--abs-note-*-label`（三张便签的提示字）、`--abs-tape*`（纸胶带）、`--abs-shadow*`（夜间换成黑色硬影）、`--abs-overlay`（弹层/抽屉遮罩）、`--abs-active-line` / `--abs-selection` / `--abs-md-*`（CodeMirror）、`--abs-tree-icon` / `--abs-tree-file` / `--abs-tree-caret`（索引卡图标，夜间为白色）、`--abs-progress`（API 进度条）、`--abs-skeleton-*`、`--abs-danger-surface` / `--abs-empty-surface`（就地错误与空状态底）。

硬阴影只有三档：`--abs-shadow-sm`（贴纸）、`--abs-shadow`（纸）、`--abs-shadow-pop`（弹层）。不使用柔和模糊大阴影；夜间只是把硬影换成更深的黑。

## 字体

- 拉丁展示：**Baloo 2 Variable**（自托管 `@fontsource-variable/baloo-2`）。
- 数据/路径/时间：**Sometype Mono**（自托管 400/500）。
- 中文正文：系统栈 `PingFang SC / Microsoft YaHei / Noto Sans SC`。
- 中文展示：只使用本机可能存在的圆体（`Zen Maru Gothic / Yuanti SC / Hiragino Maru Gothic ProN`），不引入多 MB CJK 字体。原型中的完整圆体字形不进入生产包。

## 布局

### 工作台（`/`）

- 顶栏 2 栏内边距 + 1.5px 墨线 + 纸面：左「樱」印章 + studio/repo，右「新建」、设置、更新徽标（只在检测到新版本时出现）、锁定/GitHub。
- 演示模式：顶栏下一条虚线提示条，含「看设置」「退出演示」。
- 主体 `lg:grid-cols-[252px_1fr]`：
  - **索引卡**（左）：纸面、搜索、目录树、底部排除计数；移动端为抽屉。
  - **桌面**（中）：`DEMO WORKSPACE / WORKSPACE` 眉题、大标题「今天写点什么？」、日期行、ghost「检查更新」+ ghost「草稿箱（数量）」+ 实心樱粉「新建文章」；三张旋转便签（总数/草稿/加密）；本机缓存状态条；最近动过 / 草稿箱列表；提交小票；今日小目标；API 卡。
- **本机文章缓存状态条**：表头下方一条 `.abs-paper` 虚线纸片（`role="status"`、`aria-live="polite"`）。首次加载显示「首次加载 · 正在读取全部文章」+ 等宽 `done / total` + 1.5px 薄荷进度条；检查/同步时显示「正在检查远端更新…」「正在同步文章变更」；完成后留一行等宽「已同步 · 新增 a / 修改 m / 删除 d」；失败就地 `ErrorNote` + 「重试」ghost 按钮；配额写入失败显示一行 muted 说明。只有进度/状态使用薄荷，实心樱粉仍只给「新建文章」。
- **检查更新反馈**：点击后按钮立刻禁用并把图标换成旋转态，文案按阶段显示「检查中…」/「同步中…」；tree refetch 阶段状态条已显示「正在检查远端更新…」，顶部 loading toast 持续到结果返回后才替换为成功/失败；索引卡刷新按钮同步旋转。失败不会留下永久「检查中」。
- 最近列表为行式，不用卡片网格；日期 64px 等宽，标题 + 路径，右侧状态徽章。
- 「最近动过」按 frontmatter 的 `updated` / `date` 全库降序，不做路径切片采样；表头右侧是 `.abs-seg` 的 `updated` / `date` 切换，切换后重置为 20 篇。列表下方「加载更多」每次追加 20 篇，到底显示「已全部显示 N 篇」；表头在索引中显示「同步中 X / Y」，完成后显示「全库 Y 篇」。有缓存摘要时即使文件树还在加载/失败也先渲染列表。
- **草稿箱**：操作行「草稿箱」按钮（ghost，带数量徽章；激活时纸底 `bg-blush-2` + `aria-pressed`）把同一张纸切换成本机草稿列表，表头标题改为「草稿箱」，右侧显示「N 篇 · 含自动备份 · 仅本机」与「AES-GCM 加密 / 演示模式 · 明文」，排序控件隐藏；再次点击回到「最近动过」。列表合并显式草稿与自动备份：同一路径只留保存时间更新的一份（自动备份显示「自动备份」徽章），因此未点「保存草稿」的编辑也会出现在这里。每行日期为保存/备份时间，标题 + 路径 + 「新稿 / 已有文章」「自动备份」「源文件」徽章与字数，行尾垃圾桶按钮弹 sonner 确认条（「删除草稿 / 取消」）后同时清除该路径的显式草稿与备份；空状态说明「保存草稿或自动备份」并提供「新建文章」。草稿箱只读本机，不触发任何 GitHub 请求。
- 右栏是独立纸张，与主栏 3px 间隙；不抢焦点。

### 编辑器（`/edit?path=`）

- 三张纸：文件头（返回、文件名、状态、保存草稿/GitHub/移动/删除）、frontmatter 纸、Markdown 纸；右栏实时预览。
- **保存草稿**：文件头 ghost「保存草稿」把当前编辑状态（表单/源文件模式、原始 YAML、正文、`sourceText`、已有文件的 `baseSha`）写入本机草稿箱；只写 IndexedDB，**不调用任何写 API**。真实仓库用保险库数据密钥经 HKDF（`abs:draft:v1`）派生的 AES-GCM 子密钥加密，demo 明文；成功后底栏在备份状态旁显示「草稿箱 HH:mm」并 toast。盖章提交（新建稿，或本次会话来自草稿箱）后移除该路径草稿，移动/删除同步清理；从草稿箱打开时若同路径自动备份更新，优先用备份内容，避免丢掉离开前的编辑。
- **frontmatter 纸由设置中的字段配置动态生成**：名称、类型（string/date/number/boolean/list）、必填标记；string 单行、date 文本 + 格式提示、number 数字、boolean 复选、list 逗号分隔（categories 支持 `>` 层级）；password 字段掩码。必填为空或格式错误时在字段下就地提示并阻止提交。
- **表单 / 源文件切换**：Markdown 纸头右侧「N 字 · 约 N 分钟」旁复用 `.abs-seg` 分段控件（`aria-pressed`，与设置页主题切换同一组件）。源文件模式把整份文件（`---` frontmatter + 正文）放进同一块 CodeMirror、隐藏 frontmatter 纸，眉题改为 `SOURCE · 整份文件`；页脚细条显示换行风格、字段数、未知字段数、缺少必填与「源文件模式不改写 updated」。源文件模式保存只还原原文件的 CRLF/LF 与 BOM，不解析 frontmatter、不改写键、不折叠结尾空行；YAML 损坏时纸头出现红色细条提示但仍允许保存。来源就是仓库里的那份文件，所以没有新增纹理/动画，安静规则照旧。模式是会话内视图状态（默认表单），刷新回到表单。
- **新稿状态**：新建文章先在本地起草，URL 带 `new=1`；头部显示「未提交」，隐藏 GitHub/移动/删除，底栏提示「未提交」。第一次盖章保存才创建文件（一次 API），成功后 URL 去掉 `new` 并切换为普通编辑态。刷新/直接打开没有内存草稿的 `new=1` 时先检查本机备份：有备份就弹窗恢复，没有才显示「草稿已丢失」，绝不创建空文件。开始下一篇新稿时，上一篇内存草稿先经 `capturePendingDraft` 存入草稿箱（优先最新备份，其次已有草稿，最后初始文本），确认后才清空内存草稿；因此可以同时保留多篇新稿。
- **未保存备份**：编辑时约 600ms 防抖把整份文件快照写入本机 IndexedDB（同一文件只留最新一份；键含 mode + repo + branch + path），底栏在「未保存」旁显示「本机已备份 HH:mm」。真实仓库的快照以 AES-GCM 信封落盘（密钥由保险库数据密钥经 HKDF 派生），demo 快照保持明文；锁定前先 flush 再清密钥。进入编辑器时读取备份并弹 `AlertDialog`「发现未保存的备份」：显示保存时间、字数、路径，远端已变化时多一条 danger 提示；操作为「稍后 / 丢弃备份 / 恢复备份」。恢复用 `.abs-btn`（**不引入实心樱粉**），丢弃为 ghost + `border-danger/40 text-danger`，稍后为 ghost；「稍后」后文件头下方出现 butter 细条（恢复 / 丢弃），期间暂停覆盖式备份。恢复已有文件保留备份的 base sha，保存仍走 409；恢复新稿回到「未提交」，只写 pending draft。保存/移动/删除成功后删除备份；设置里可关闭或清除本仓库备份。弹窗不开入场动画，安静规则照旧。
- **安静规则**：编辑纸无纹理、无旋转、无入场动画；只有 CodeMirror 的活动行/选区/选词匹配使用极浅腮红。Markdown 语法色只做层级区分（标题 `--abs-ink`、链接/分割线 `--abs-sakura-deep`、代码 `--abs-success`、字符串 `--abs-warning`、标点/引用/注释 `--abs-ink-soft`），不加背景块、不加发光。印章是唯一的实心红。
- 提交：底栏「盖章保存」旋转印章；开启确认时弹出提交消息纸片；新稿按钮为「确认创建」，普通保存为「确认盖章」；成功后回执 toast。
- 冲突：Radix Dialog，提供「重新加载远端 / 覆盖远端 / 取消」；新稿的远端同名冲突只提示换路径并保留草稿，不提供覆盖。
- 只读/无权限：保存按钮禁用，底部提示；GitHub 返回 403 时 toast + 详情。
- 移动：预填当前路径，一次提交；删除：AlertDialog。
- 移动端：预览在下方；索引在抽屉；盖章固定在纸尾。

### 设置（`/settings`）

- 左侧六张纸（内容与排除、本机文章缓存、Frontmatter 字段、提交消息、编辑与预览、外观），右侧安全卡 + 当前配置卡。
- **折叠面板**：每个分区都是 `Collapse`（原生 button + `aria-expanded`/`aria-controls`，body 用 `hidden` 隐藏）。默认状态只在挂载时按视口决定：<768px 手机竖屏全部折叠，≥768px 平板/桌面全部展开；之后跟随用户操作，旋转屏幕不强制重置。折叠时标题行仍显示摘要（缓存篇数/演示模式、字段数及校验错误、当前主题、令牌状态），顶部「保存设置」始终可见。
- **安全卡**：显示「当前解锁方式」，下方是三张 radio 卡片（设备指纹 / 密码 / 密码 + 设备双因子）与「更新解锁方式」按钮；模式与密码单独保存、立即生效，不参与顶部「保存设置」。选中双因子时就地给出 danger 边说明「两者必须同时匹配，任一丢失只能重置保险库」，旧版并存保险库额外显示升级提示。demo 模式下隐藏解锁方式、锁定与重置入口。
- **本机文章缓存**：内容与排除纸下方一张纸，显示「演示模式 · 仅内存」或「N 篇 · AES-GCM」、已缓存篇数 / 上次同步时间 / 树 sha 短值；ghost 按钮「检查更新」「强制全量更新」（强制先弹 sonner 确认条），同步中按钮禁用、图标旋转并显示阶段文案 + `done / total` 与薄荷进度条；「检查更新」进行中按钮文案改为「检查中…」；demo 禁用并说明不写本机。文案解释首次全量、之后按路径 + blob sha 只读新增/修改、删除已删除文章，以及真实仓库用保险库子密钥加密、锁定后不可读。
- **索引并发**：内容与排除纸底部可调 1–10（默认 3），决定首次全量读取与增量同步同时进行几个 20 篇批次；调高更快，过高可能触发 GitHub 限流。保存写入设置，下一次同步生效。
- **外观**：主题可选「跟随系统 / 昼 / 夜」，即时生效并随设置持久化；默认跟随系统。夜间与昼间共用同一套 token，切换不改变布局与字号。
- **Frontmatter 字段**：可增删字段行（名称 / 类型 / 必填）；「恢复常用字段」回到 hello-world 参考集；字段定义非法（空名、重复、保留名、非法字符）时阻止保存并就地说明。删除字段不会删除已有文件里的键，编辑器会把它作为未知字段保留。
- 演示模式下连接字段禁用并说明；Frontmatter 字段、提交模板、字号、自动锁定、外观等仍可调。
- 危险操作（重新配置、重置保险库）使用红色描边而非实心红，避免误触。

### Setup / Unlock

- 居中纸片 + 右侧说明/提醒贴纸；Setup 是「把仓库接进来」，Unlock 是「欢迎回来」。
- Setup 的解锁方式是一组 radio 卡片（设备指纹 / 密码 / 密码 + 设备双因子），选中需要密码的模式才显示密码输入；双因子卡片下方固定一条 danger 说明，不弹额外确认框。
- Unlock 按模式渲染：设备指纹模式自动尝试并用主按钮；密码/双因子只显示密码表单（双因子额外一条「需要同一台设备的指纹」提示，不提供设备捷径）；旧版并存保险库保留密码 + 设备两个入口并提示去设置升级。
- 印章、纸胶带、便签只在手壳/侧栏/空状态/Setup/Unlock 出现。
- 密码框使用等宽字体 + 字距；错误就地显示，不弹通用 alert。

## 组件与状态

- `.abs-paper` / `.abs-sheet` / `.abs-sticky` / `.abs-receipt` / `.abs-stamp` / `.abs-tape` / `.abs-seal` / `.abs-badge-*` / `.abs-tree-row` / `.abs-input` / `.abs-btn*` / `.abs-seg` / `.abs-progress` 是设计系统组件，集中定义在 `src/styles/app.css`，Tailwind 原子类只做布局与间距。
- **主题**：`ThemeProvider` 把 `settings.appearance.theme`（`system / day / night`）解析为 `<html data-theme>`；`index.html` 内联脚本在首帧前应用，避免白闪；需要布尔值的组件（CodeMirror 的 dark 主题）用 `useResolvedTheme()`。不新增主题命名空间，也不允许组件里写夜间分支。
- 状态：Zustand `settings`（persist）、`vault`（不持久化）、`content`（本机文章缓存状态：status/progress/summaries/错误，不持久化，锁定即清空）、`drafts`（草稿箱列表：显式草稿 + 自动备份合并后的 items/status，锁定即清空）、`ui`、`rate-limit`、`last-commit`、`editor guard`、`pending-post`、`pwa`；未保存备份走 `useEditorBackup` + `lib/backup`（IndexedDB），草稿箱走 `lib/drafts`（IndexedDB `abs-drafts`，AES-GCM 子密钥），本机文章缓存走 `lib/content`（IndexedDB `abs-content`，AES-GCM），三者都不放进 service worker 缓存；服务端状态全部在 TanStack Query，key 含 `repo@rootDir`，切换仓库/根目录自动失效。
- 反馈全部就地：`ErrorNote`、`EmptyState`、`SkeletonList`、sonner toast；不把错误塞进 `console` 当用户反馈。toast 右侧常驻 `.abs-toast-close` X（纸底、1.5px 线边框的 24px 方块，hover 转 ink），点击立即关闭；自动消失与滑动关闭保留。
- **确认统一走 `confirmAction`（`components/confirm-toast.tsx`）**：不再用 `window.confirm`。自定义 sonner toast 呈现「说明 + 取消 / 确认」，返回 `Promise<boolean>`，确认按钮用 `.abs-btn`（破坏性操作用 `.abs-btn-danger` 红色描边，实心樱粉仍只给「新建文章」）；不自动消失，默认焦点在「取消」，Esc 等价取消，滑动关闭/被新确认顶掉都按取消收口，调用方的 `await` 不会悬挂。确认后的异步动作由调用方继续 `await`，并对慢操作给按钮忙碌态与结果 toast。
- **PWA 更新提示**：`PwaUpdate` 挂在 App 根部（`virtual:pwa-register/react`）。新版本进入 waiting 时用 Radix `AlertDialog` 弹「网站有新版本」，按钮「稍后」（`.abs-btn-ghost`）/「立即刷新」（默认 `.abs-btn`，**不用**实心樱粉——实心樱粉仍只属于「新建文章」）。点过「稍后」后顶栏出现带樱粉圆点的 `.abs-icon-btn`，可再次唤起弹窗；编辑器脏状态时弹窗内多一行 danger 提示，刷新时沿用现有 `beforeunload` 兜底。只有用户点「立即刷新」才整页 reload，**不自动刷新**。`pnpm dev` 不注册 Service Worker，PWA 只在构建产物里可见。浏览器标签图标与 `apple-touch-icon` 统一使用 `public/apple-touch-icon.png`。

## 动效

- 只用于状态变化：抽屉滑入、弹层出现、印章按下 0.9s、保存时轻微旋转。
- 时长 150–260ms；spring `cubic-bezier(0.34,1.56,0.64,1)` 只用于贴纸/印章。
- `prefers-reduced-motion: reduce` 下关闭旋转/位移动画，只保留透明度。
- 更新弹层沿用 Radix 的默认淡入，不加印章/位移/入场动画；顶栏圆点徽标不做脉冲。
- 不做页面入场、不做滚动视差、不做自动播放。

## 无障碍

- 所有交互元素有可见 `:focus-visible`；按钮有 `type`。
- 颜色对比：主文字 `#3D2F36` on `#FFFBF5`（12.3:1）/ 夜间 `#F2E6DE` on `#2A2025`（12.9:1）；辅助 `#7A686E`（昼）/ `#B3A19A`（夜，6.37:1）；樱色小字夜间 6.09:1。正文强调色用于大字号/描边，不用于小号正文；编辑器语法角色单独校验（下条）。
- Markdown 语法色：六组角色（heading/link/code/string/muted/rule）在昼/夜对纸面、活动行、选区的最低对比度均 ≥4.5:1；`---` 夜间为 8.12:1（旧 CodeMirror 默认 `#219` 仅 1.21:1），Markdown 标点不再是默认的 `#404740`。预览代码块 token 在深色底（昼 `#2f2a2e` / 夜 `#171114`）上为 5.4:1–12.6:1。
- 夜间输入框边框 `--abs-input-line` 提到 3.96:1（昼模式仍是 1.59 的既有偏低值，后续两套一起修）；夜间索引卡图标为白色，不靠颜色区分文件夹/文件（形状 + 文案）。
- 表单 label 通过包裹关联；错误有 `role="alert"`；装饰性 SVG `aria-hidden`。
- 弹层用 Radix（焦点圈、Esc、点外关闭）；文件树按钮带 `aria-expanded`。
- 键盘：`Ctrl/Cmd+K` 聚焦文件搜索；Tab 顺序从顶栏到索引到内容。
- 390px 视口无横向滚动；点击目标 ≥ 32px。

## 与决策台原型的差异

- 原型里的封面网格、日历、分类视图、设置左侧目录、底部状态条未进入 v1；当前以文件树 + 工作台为主。
- 代码高亮在编辑器中用 CodeMirror 的 Markdown 语法 + 自定义 `HighlightStyle`（`--abs-md-*` 角色）；默认浅色 fallback 已关闭。预览代码块用内置轻量高亮（按语言族着色、未知语言纯文本），不接入 shiki，避免首屏膨胀。
- 预览对「表格单元格内含未转义 `|` 的行内代码」这类 GFM 边界会按标准表格解析；生产内容写作时请用 `\|`。这是解析器行为，不是安全降级。
- 新建文章通过对话框而不是独立页面；移动/删除在编辑器中完成。
- **新稿先在本地起草**：对话框不写仓库；进入编辑器时显示「未提交」，第一次盖章才创建文件（一次 API）。这比原型里「先建文件再编辑」更克制，也避免空文件提交。刷新后若本机有备份，进入编辑器会先提示恢复草稿，而不是直接丢失。
- **未保存备份**：原型没有本地草稿恢复；实现增加 IndexedDB 备份与进入检查。它只在本机、可关闭/清除，不改变 GitHub 写协议；恢复旧草稿时保留 base sha，冲突处理仍由现有 409 流程负责。
- **frontmatter 字段可配置**：原型是固定字段；实现改为设置中的字段列表（名称/类型/必填），默认参考 hello-world 常用字段，超出字段作为未知字段保留。
- **夜间模式按实验页落地**：暖墨夜纸、白色索引卡图标、danger 偏橙红与品牌粉分开；采用「跟随系统 + 手动昼夜」，没有做纯黑反转或第二套主题命名空间。实验页见 `design/night-mode.html`。
- 设计台的「提交小票」在真实模式显示 GitHub 提交链接；demo 显示 `in-memory`。
- **PWA 与更新提醒**：原型是纯静态页面；实现加了 manifest + Service Worker 预缓存（应用壳、字体、图标），二次打开与弱网/断网打开都读缓存。更新提醒是提醒不是自动升级：新 SW 进入 waiting 后弹窗，只有用户点「立即刷新」才 reload，「稍后」后顶栏留徽标。GitHub API 响应永不进 CacheStorage。

## 截图出处

- `docs/screenshots/dashboard.png`、`editor.png`、`settings.png`、`mobile.png`：**生产构建**（`pnpm build` + `vite preview`）+ `?demo=1` 固定 fixture，1440px / 390px，2026-10-18，昼间主题。
- `docs/screenshots/night-dashboard.png`、`night-editor.png`、`night-settings.png`、`night-mobile.png`：同一构建与 fixture 的夜间主题（设置里切「夜」），尺寸同上。
- `docs/screenshots/pwa-update.png`：同一生产构建 + `?demo=1`，390px 昼间主题，模拟 waiting 新版本时的更新弹窗（顶栏可见带樱粉圆点的刷新徽标）。
- `design/screenshots/`：决策台四个方向的工作台与对比板，以及夜间模式实验页的截图（`night-*.png`、`tree-icons-night.png`）。
- 截图不使用真实私有内容；测试仓库只出现在 live 手动验证中，不进入仓库截图。
- `editor.png`、`night-editor.png` 拍于「表单 / 源文件」切换控件加入之前（编辑器纸头新增分段控件）；未保存备份弹窗与恢复条也未进入现有截图；重拍前以本文档「编辑器」段为准。

## 验收 verdict

**PASS（v1 + 字段/新稿 + 夜间模式）**：视觉语言在顶栏、索引、便签、纸张、印章、提交小票、设置/解锁页保持一致；编辑器安静规则成立；移动端可完成「找文件 → 改 → 盖章」；安全路径（三种解锁方式、严格双因子、冲突、只读、空仓库）有明确反馈。新文章为本地草稿、首次保存单次创建；frontmatter 字段由设置驱动，必填校验和类型化输入可用；未配置字段继续保留。主题可跟随系统或手动固定昼/夜，首帧无白闪，CodeMirror 与预览随主题切换；夜间对比度达标（主文字 12.9:1、辅助 6.37:1、输入边框 3.96:1）；Markdown 源码语法色在昼/夜对纸面、活动行、选区均 ≥4.5:1，`---` 不再回落到 CodeMirror 默认的 `#219`。

**未完成/下一步**：图片粘贴上传、跨文件搜索、命令面板、封面/日历视图、离线编辑与离线保存队列、只读模式的自动探测（目前依赖写操作 403 提示）、昼模式输入框边框与占位符对比度的顺手修正。

**PWA（2026-10）**：manifest（name/short_name/display/theme_color/icons 含 maskable）+ Service Worker 预缓存 50 条 ≈ 2.3 MiB（html/js/css/woff2/图标）；断网从预缓存打开工作台；更新弹窗只在 waiting 新版本时出现，只有「立即刷新」会整页 reload，「稍后」后顶栏徽标可再唤起；顶栏在 390px 下仍一行。

**未保存备份（2026-10）**：编辑后约 600ms 底栏出现「本机已备份」，进入编辑器检查备份并弹窗；「稍后」保留 butter 恢复条，「恢复」支持表单/源文件/新稿，「丢弃」后不再提示；保存/移动/删除成功即清除；恢复旧草稿保留 base sha，保存仍走 409。真实仓库的备份是 AES-GCM 密文（保险库数据密钥经 HKDF 派生的子密钥），demo 备份明文；锁定前先 flush 再清密钥，重置保险库会一并清除真实仓库备份；设置可关闭与清除。

**1.0.0（2026-10）**：设置页每个分区可折叠（手机 <768px 默认折叠、宽屏默认展开，标题行保留摘要）；「检查更新」进行中即时显示按钮/状态条/toast 反馈；「最近动过」支持 `updated` / `date` 排序与每次 20 篇的「加载更多」；浏览器标签与 `apple-touch-icon` 统一使用 `/apple-touch-icon.png`；README 改为分层结构，备份/缓存/测试/架构细节下沉到 `docs/`。
