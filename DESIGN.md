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

| Token | 值 | 用途 |
|---|---|---|
| `--abs-paper` | `#FFFBF5` | 纸面、卡片、编辑区 |
| `--abs-paper-2` | `#FFF6EC` | 次级纸面 |
| `--abs-desk` | `#F6EDE6` | 桌面背景（+ 22px 点阵） |
| `--abs-blush` | `#F7DDE5` | 腮红块、选中、便签 |
| `--abs-blush-2` | `#FBE9EF` | 浅腮红 |
| `--abs-sakura` | `#C93F6D` | 主强调、印章、唯一实心按钮 |
| `--abs-sakura-deep` | `#AD305C` | hover / 深强调 |
| `--abs-mint` | `#A8E0CF` | 成功/完成 |
| `--abs-butter` | `#FFE9AE` | 提示/今日便签 |
| `--abs-ink` | `#3D2F36` | 主文字、描边 |
| `--abs-ink-soft` | `#6B5A61` | 次级文字 |
| `--abs-muted` | `#7A686E` | 辅助文字、编号 |
| `--abs-line` / `--abs-line-soft` | `#D9C6BF` / `#EADAD3` | 实线 / 虚线 |
| `--abs-success` / `--abs-warning` / `--abs-danger` | `#2F6B58` / `#7A5B16` / `#B23A4E` | 状态 |
| `--abs-focus` | `#A8496B` | `:focus-visible` |

硬阴影只有三档：`--abs-shadow-sm`（贴纸）、`--abs-shadow`（纸）、`--abs-shadow-pop`（弹层）。不使用柔和模糊大阴影。

## 字体

- 拉丁展示：**Baloo 2 Variable**（自托管 `@fontsource-variable/baloo-2`）。
- 数据/路径/时间：**Sometype Mono**（自托管 400/500）。
- 中文正文：系统栈 `PingFang SC / Microsoft YaHei / Noto Sans SC`。
- 中文展示：只使用本机可能存在的圆体（`Zen Maru Gothic / Yuanti SC / Hiragino Maru Gothic ProN`），不引入多 MB CJK 字体。原型中的完整圆体字形不进入生产包。

## 布局

### 工作台（`/`）

- 顶栏 2 栏内边距 + 1.5px 墨线 + 纸面：左「樱」印章 + studio/repo，右「新建」、设置、锁定/GitHub。
- 演示模式：顶栏下一条虚线提示条，含「看设置」「退出演示」。
- 主体 `lg:grid-cols-[252px_1fr]`：
  - **索引卡**（左）：纸面、搜索、目录树、底部排除计数；移动端为抽屉。
  - **桌面**（中）：`DEMO WORKSPACE / WORKSPACE` 眉题、大标题「今天写点什么？」、日期行、新建按钮；三张旋转便签（总数/草稿/加密）；最近动过列表；提交小票；今日小目标；API 卡。
- 最近列表为行式，不用卡片网格；日期 64px 等宽，标题 + 路径，右侧状态徽章。
- 右栏是独立纸张，与主栏 3px 间隙；不抢焦点。

### 编辑器（`/edit?path=`）

- 三张纸：文件头（返回、文件名、状态、GitHub/移动/删除）、frontmatter 纸、Markdown 纸；右栏实时预览。
- **frontmatter 纸由设置中的字段配置动态生成**：名称、类型（string/date/number/boolean/list）、必填标记；string 单行、date 文本 + 格式提示、number 数字、boolean 复选、list 逗号分隔（categories 支持 `>` 层级）；password 字段掩码。必填为空或格式错误时在字段下就地提示并阻止提交。
- **新稿状态**：新建文章先在本地起草，URL 带 `new=1`；头部显示「未提交」，隐藏 GitHub/移动/删除，底栏提示「未提交」。第一次盖章保存才创建文件（一次 API），成功后 URL 去掉 `new` 并切换为普通编辑态。刷新/直接打开没有草稿的 `new=1` 时显示「草稿已丢失」，绝不创建空文件。
- **安静规则**：编辑纸无纹理、无旋转、无入场动画；只有 CodeMirror 的活动行/选区使用极浅腮红。印章是唯一的实心红。
- 提交：底栏「盖章保存」旋转印章；开启确认时弹出提交消息纸片；新稿按钮为「确认创建」，普通保存为「确认盖章」；成功后回执 toast。
- 冲突：Radix Dialog，提供「重新加载远端 / 覆盖远端 / 取消」；新稿的远端同名冲突只提示换路径并保留草稿，不提供覆盖。
- 只读/无权限：保存按钮禁用，底部提示；GitHub 返回 403 时 toast + 详情。
- 移动：预填当前路径，一次提交；删除：AlertDialog。
- 移动端：预览在下方；索引在抽屉；盖章固定在纸尾。

### 设置（`/settings`）

- 左侧四张纸（内容与排除、Frontmatter 字段、提交消息、编辑与预览），右侧安全卡 + 当前配置卡。
- **Frontmatter 字段**：可增删字段行（名称 / 类型 / 必填）；「恢复常用字段」回到 hello-world 参考集；字段定义非法（空名、重复、保留名、非法字符）时阻止保存并就地说明。删除字段不会删除已有文件里的键，编辑器会把它作为未知字段保留。
- 演示模式下连接字段禁用并说明；Frontmatter 字段、提交模板、字号、自动锁定等仍可调。
- 危险操作（重新配置、重置保险库）使用红色描边而非实心红，避免误触。

### Setup / Unlock

- 居中纸片 + 右侧说明/提醒贴纸；Setup 是「把仓库接进来」，Unlock 是「欢迎回来」。
- 印章、纸胶带、便签只在手壳/侧栏/空状态/Setup/Unlock 出现。
- 密码框使用等宽字体 + 字距；错误就地显示，不弹通用 alert。

## 组件与状态

- `.abs-paper` / `.abs-sheet` / `.abs-sticky` / `.abs-receipt` / `.abs-stamp` / `.abs-tape` / `.abs-seal` / `.abs-badge-*` / `.abs-tree-row` / `.abs-input` / `.abs-btn*` 是设计系统组件，集中定义在 `src/styles/app.css`，Tailwind 原子类只做布局与间距。
- 状态：Zustand `settings`（persist）、`vault`（不持久化）、`ui`、`rate-limit`、`last-commit`、`editor guard`；服务端状态全部在 TanStack Query，key 含 `repo@rootDir`，切换仓库/根目录自动失效。
- 反馈全部就地：`ErrorNote`、`EmptyState`、`SkeletonList`、sonner toast；不把错误塞进 `console` 当用户反馈。

## 动效

- 只用于状态变化：抽屉滑入、弹层出现、印章按下 0.9s、保存时轻微旋转。
- 时长 150–260ms；spring `cubic-bezier(0.34,1.56,0.64,1)` 只用于贴纸/印章。
- `prefers-reduced-motion: reduce` 下关闭旋转/位移动画，只保留透明度。
- 不做页面入场、不做滚动视差、不做自动播放。

## 无障碍

- 所有交互元素有可见 `:focus-visible`；按钮有 `type`。
- 颜色对比：主文字 `#3D2F36` on `#FFFBF5`；辅助 `#7A686E`；强调 `#C93F6D` 用于大字号/描边，不用于小号正文。
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
- 设计台的「提交小票」在真实模式显示 GitHub 提交链接；demo 显示 `in-memory`。

## 截图出处

- `docs/screenshots/dashboard.png`、`editor.png`、`settings.png`、`mobile.png`：**生产构建**（`pnpm build` + `vite preview`）+ `?demo=1` 固定 fixture，1440px / 390px，2026-10-18。
- `design/screenshots/`：决策台四个方向的工作台与对比板，用于方向选择。
- 截图不使用真实私有内容；测试仓库只出现在 live 手动验证中，不进入仓库截图。

## 验收 verdict

**PASS（v1 + 字段/新稿改进）**：视觉语言在顶栏、索引、便签、纸张、印章、提交小票、设置/解锁页保持一致；编辑器安静规则成立；移动端可完成「找文件 → 改 → 盖章」；安全路径（设备/密码解锁、冲突、只读、空仓库）有明确反馈。新文章为本地草稿、首次保存单次创建；frontmatter 字段由设置驱动，必填校验和类型化输入可用；未配置字段继续保留。

**未完成/下一步**：图片粘贴上传、跨文件搜索、命令面板、封面/日历视图、主题切换、PWA、离线草稿、shiki 预览高亮、只读模式的自动探测（目前依赖写操作 403 提示）、新稿跨刷新持久化。
