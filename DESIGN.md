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

细节 token：`--abs-stamp*`（印泥颜色与描边环）、`--abs-note-*-label`（三张便签的提示字）、`--abs-tape*`（纸胶带）、`--abs-shadow*`（夜间换成黑色硬影）、`--abs-overlay`（弹层/抽屉遮罩）、`--abs-active-line` / `--abs-selection`（CodeMirror）、`--abs-tree-icon` / `--abs-tree-file` / `--abs-tree-caret`（索引卡图标，夜间为白色）、`--abs-progress`（API 进度条）、`--abs-skeleton-*`、`--abs-danger-surface` / `--abs-empty-surface`（就地错误与空状态底）。

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
  - **桌面**（中）：`DEMO WORKSPACE / WORKSPACE` 眉题、大标题「今天写点什么？」、日期行、新建按钮；三张旋转便签（总数/草稿/加密）；最近动过列表；提交小票；今日小目标；API 卡。
- 最近列表为行式，不用卡片网格；日期 64px 等宽，标题 + 路径，右侧状态徽章。
- 「最近动过」按 frontmatter 的 `updated` / `date` 全库降序，不做路径切片采样；表头在索引中显示「读取中 X / Y」，完成后显示「全库 Y 篇」。
- 右栏是独立纸张，与主栏 3px 间隙；不抢焦点。

### 编辑器（`/edit?path=`）

- 三张纸：文件头（返回、文件名、状态、GitHub/移动/删除）、frontmatter 纸、Markdown 纸；右栏实时预览。
- **frontmatter 纸由设置中的字段配置动态生成**：名称、类型（string/date/number/boolean/list）、必填标记；string 单行、date 文本 + 格式提示、number 数字、boolean 复选、list 逗号分隔（categories 支持 `>` 层级）；password 字段掩码。必填为空或格式错误时在字段下就地提示并阻止提交。
- **表单 / 源文件切换**：Markdown 纸头右侧「N 字 · 约 N 分钟」旁复用 `.abs-seg` 分段控件（`aria-pressed`，与设置页主题切换同一组件）。源文件模式把整份文件（`---` frontmatter + 正文）放进同一块 CodeMirror、隐藏 frontmatter 纸，眉题改为 `SOURCE · 整份文件`；页脚细条显示换行风格、字段数、未知字段数、缺少必填与「源文件模式不改写 updated」。源文件模式保存只还原原文件的 CRLF/LF 与 BOM，不解析 frontmatter、不改写键、不折叠结尾空行；YAML 损坏时纸头出现红色细条提示但仍允许保存。来源就是仓库里的那份文件，所以没有新增纹理/动画，安静规则照旧。模式是会话内视图状态（默认表单），刷新回到表单。
- **新稿状态**：新建文章先在本地起草，URL 带 `new=1`；头部显示「未提交」，隐藏 GitHub/移动/删除，底栏提示「未提交」。第一次盖章保存才创建文件（一次 API），成功后 URL 去掉 `new` 并切换为普通编辑态。刷新/直接打开没有草稿的 `new=1` 时显示「草稿已丢失」，绝不创建空文件。
- **安静规则**：编辑纸无纹理、无旋转、无入场动画；只有 CodeMirror 的活动行/选区使用极浅腮红。印章是唯一的实心红。
- 提交：底栏「盖章保存」旋转印章；开启确认时弹出提交消息纸片；新稿按钮为「确认创建」，普通保存为「确认盖章」；成功后回执 toast。
- 冲突：Radix Dialog，提供「重新加载远端 / 覆盖远端 / 取消」；新稿的远端同名冲突只提示换路径并保留草稿，不提供覆盖。
- 只读/无权限：保存按钮禁用，底部提示；GitHub 返回 403 时 toast + 详情。
- 移动：预填当前路径，一次提交；删除：AlertDialog。
- 移动端：预览在下方；索引在抽屉；盖章固定在纸尾。

### 设置（`/settings`）

- 左侧五张纸（内容与排除、Frontmatter 字段、提交消息、编辑与预览、外观），右侧安全卡 + 当前配置卡。
- **外观**：主题可选「跟随系统 / 昼 / 夜」，即时生效并随设置持久化；默认跟随系统。夜间与昼间共用同一套 token，切换不改变布局与字号。
- **Frontmatter 字段**：可增删字段行（名称 / 类型 / 必填）；「恢复常用字段」回到 hello-world 参考集；字段定义非法（空名、重复、保留名、非法字符）时阻止保存并就地说明。删除字段不会删除已有文件里的键，编辑器会把它作为未知字段保留。
- 演示模式下连接字段禁用并说明；Frontmatter 字段、提交模板、字号、自动锁定、外观等仍可调。
- 危险操作（重新配置、重置保险库）使用红色描边而非实心红，避免误触。

### Setup / Unlock

- 居中纸片 + 右侧说明/提醒贴纸；Setup 是「把仓库接进来」，Unlock 是「欢迎回来」。
- 印章、纸胶带、便签只在手壳/侧栏/空状态/Setup/Unlock 出现。
- 密码框使用等宽字体 + 字距；错误就地显示，不弹通用 alert。

## 组件与状态

- `.abs-paper` / `.abs-sheet` / `.abs-sticky` / `.abs-receipt` / `.abs-stamp` / `.abs-tape` / `.abs-seal` / `.abs-badge-*` / `.abs-tree-row` / `.abs-input` / `.abs-btn*` / `.abs-seg` / `.abs-progress` 是设计系统组件，集中定义在 `src/styles/app.css`，Tailwind 原子类只做布局与间距。
- **主题**：`ThemeProvider` 把 `settings.appearance.theme`（`system / day / night`）解析为 `<html data-theme>`；`index.html` 内联脚本在首帧前应用，避免白闪；需要布尔值的组件（CodeMirror 的 dark 主题）用 `useResolvedTheme()`。不新增主题命名空间，也不允许组件里写夜间分支。
- 状态：Zustand `settings`（persist）、`vault`（不持久化）、`ui`、`rate-limit`、`last-commit`、`editor guard`；服务端状态全部在 TanStack Query，key 含 `repo@rootDir`，切换仓库/根目录自动失效。
- 反馈全部就地：`ErrorNote`、`EmptyState`、`SkeletonList`、sonner toast；不把错误塞进 `console` 当用户反馈。toast 右侧常驻 `.abs-toast-close` X（纸底、1.5px 线边框的 24px 方块，hover 转 ink），点击立即关闭；自动消失与滑动关闭保留。
- **PWA 更新提示**：`PwaUpdate` 挂在 App 根部（`virtual:pwa-register/react`）。新版本进入 waiting 时用 Radix `AlertDialog` 弹「网站有新版本」，按钮「稍后」（`.abs-btn-ghost`）/「立即刷新」（默认 `.abs-btn`，**不用**实心樱粉——实心樱粉仍只属于「新建文章」）。点过「稍后」后顶栏出现带樱粉圆点的 `.abs-icon-btn`，可再次唤起弹窗；编辑器脏状态时弹窗内多一行 danger 提示，刷新时沿用现有 `beforeunload` 兜底。只有用户点「立即刷新」才整页 reload，**不自动刷新**。`pnpm dev` 不注册 Service Worker，PWA 只在构建产物里可见。

## 动效

- 只用于状态变化：抽屉滑入、弹层出现、印章按下 0.9s、保存时轻微旋转。
- 时长 150–260ms；spring `cubic-bezier(0.34,1.56,0.64,1)` 只用于贴纸/印章。
- `prefers-reduced-motion: reduce` 下关闭旋转/位移动画，只保留透明度。
- 更新弹层沿用 Radix 的默认淡入，不加印章/位移/入场动画；顶栏圆点徽标不做脉冲。
- 不做页面入场、不做滚动视差、不做自动播放。

## 无障碍

- 所有交互元素有可见 `:focus-visible`；按钮有 `type`。
- 颜色对比：主文字 `#3D2F36` on `#FFFBF5`（12.3:1）/ 夜间 `#F2E6DE` on `#2A2025`（12.9:1）；辅助 `#7A686E`（昼）/ `#B3A19A`（夜，6.37:1）；樱色小字夜间 6.09:1。强调色用于大字号/描边，不用于小号正文。
- 夜间输入框边框 `--abs-input-line` 提到 3.96:1（昼模式仍是 1.59 的既有偏低值，后续两套一起修）；夜间索引卡图标为白色，不靠颜色区分文件夹/文件（形状 + 文案）。
- 表单 label 通过包裹关联；错误有 `role="alert"`；装饰性 SVG `aria-hidden`。
- 弹层用 Radix（焦点圈、Esc、点外关闭）；文件树按钮带 `aria-expanded`。
- 键盘：`Ctrl/Cmd+K` 聚焦文件搜索；Tab 顺序从顶栏到索引到内容。
- 390px 视口无横向滚动；点击目标 ≥ 32px。

## 与决策台原型的差异

- 原型里的封面网格、日历、分类视图、设置左侧目录、底部状态条未进入 v1；当前以文件树 + 工作台为主。
- 代码高亮在编辑器中用 CodeMirror 的 Markdown 语法；预览用深色代码块，不使用 shiki 高亮（依赖已装但未接入，避免首屏膨胀）。
- 预览对「表格单元格内含未转义 `|` 的行内代码」这类 GFM 边界会按标准表格解析；生产内容写作时请用 `\|`。这是解析器行为，不是安全降级。
- 新建文章通过对话框而不是独立页面；移动/删除在编辑器中完成。
- **新稿先在本地起草**：对话框不写仓库；进入编辑器时显示「未提交」，第一次盖章才创建文件（一次 API）。这比原型里「先建文件再编辑」更克制，也避免空文件提交。
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
- `editor.png`、`night-editor.png` 拍于「表单 / 源文件」切换控件加入之前（编辑器纸头新增分段控件）；重拍前以本文档「编辑器」段为准。

## 验收 verdict

**PASS（v1 + 字段/新稿 + 夜间模式）**：视觉语言在顶栏、索引、便签、纸张、印章、提交小票、设置/解锁页保持一致；编辑器安静规则成立；移动端可完成「找文件 → 改 → 盖章」；安全路径（设备/密码解锁、冲突、只读、空仓库）有明确反馈。新文章为本地草稿、首次保存单次创建；frontmatter 字段由设置驱动，必填校验和类型化输入可用；未配置字段继续保留。主题可跟随系统或手动固定昼/夜，首帧无白闪，CodeMirror 与预览随主题切换；夜间对比度达标（主文字 12.9:1、辅助 6.37:1、输入边框 3.96:1）。

**未完成/下一步**：图片粘贴上传、跨文件搜索、命令面板、封面/日历视图、离线草稿与离线保存队列、shiki 预览高亮、只读模式的自动探测（目前依赖写操作 403 提示）、新稿跨刷新持久化、昼模式输入框边框与占位符对比度的顺手修正。

**PWA（2026-10）**：manifest（name/short_name/display/theme_color/icons 含 maskable）+ Service Worker 预缓存 50 条 ≈ 2.3 MiB（html/js/css/woff2/图标）；断网从预缓存打开工作台；更新弹窗只在 waiting 新版本时出现，只有「立即刷新」会整页 reload，「稍后」后顶栏徽标可再唤起；顶栏在 390px 下仍一行。
