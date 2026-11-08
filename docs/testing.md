[← 返回 README](../README.md)

# 测试覆盖、手动 E2E 与测试仓库

## 测试仓库与环境

- 本仓库的自动测试使用 `astro-blog-content-test` 这个专用测试仓库。
- 真实的 `astro-blog-content` 请单独创建一个只授权它的 fine-grained token；测试 token 不要用于生产。
- 测试仓库 `God-2077/astro-blog-content-test` 已在开发时用 `pnpm test:seed` 写入种子文件；空仓库也能连接，但文件树会提示「仓库是空的，请先创建一次初始提交」。
- `.env.local` 只给 Node 测试用，已在 `.gitignore` 中；不要把真实 PAT 写进任何会被提交的文件。
- 测试结束请**轮换测试 token**；`.env.local` 不要提交。

## 命令

```bash
cp .env.example .env.local   # 填入测试 PAT / 仓库
pnpm test:seed               # 测试仓库为空时也能创建首个提交
pnpm test                    # 297 个单元测试（路径、frontmatter 字段、编码、vault 多仓库 PAT/迁移/双因子/导出前密码复核/批量替换、备份加密、预览、批量读取、GitHub 请求 no-store 缓存策略、本机文章缓存与增量 diff/同步、切换仓库缓存复用、更新轮询、未保存备份、设置导出/导入文档、排序/分页、检查中状态、i18n 语言检测/四语键与占位符/复数/回退/useT）
pnpm test:live               # 8 个真实 GitHub 集成测试（会创建/移动/删除 src/_e2e/*，最后清理）
pnpm test:e2e                # 38 个 Playwright 测试（1 setup + 30 demo/多仓库 mock/i18n + 4 live + 3 PWA；live 需 .env.local）
pnpm test:e2e:pwa            # 只跑 PWA 组（会先 vite build 再 vite preview）
pnpm pwa:icons               # 重新生成 public/icon-*.png（零依赖脚本）
pnpm test:clean              # 兜底清理 src/_e2e/*
pnpm verify                  # typecheck + lint + unit + build
```

## 覆盖清单

- 单元测试覆盖：排除规则、树模型（`rootDir` 为 `/`、`src/`、`./src` 等写法时，直接位于根目录的文章要成为索引卡顶层节点）、提交模板与 `{title}`、frontmatter 解析/回写/CRLF/注释保留、源文件模式整文件写回/EOL/BOM、字段定义/类型/必填/删除、源文件模式缺少必填提示、新稿初始文档、新稿标题字段显隐、新建文章手填文件名解析（保留空格/CJK/.mdx、路径分隔符/控制字符/Windows 非法字符/保留名/结尾点拒绝、其他显式后缀保留原名并标记提示、无后缀补 .md、非法名称原因码、标题 slug 与 .mdx 识别）、设置迁移与仓库档案切换（归档/恢复/深拷贝/去重/清空保留默认值）、配置导出（token 收集、legacy 只给活动仓库、同仓库多分支去重、缺 PAT 顺序、tokens 排序、schema 规范化、文件名）、配置导入（format/version/settings/token 校验、缺 PAT 顺序、整体替换、同仓库多分支、拒绝原型键）、UTF-8 base64、vault 三种解锁模式（多仓库 PAT 映射、AAD 绑定仓库、添加/替换/删除令牌、批量替换并移除旧令牌、rewrap 保留全部令牌、旧单令牌迁移、双因子无设备包装、换设备失败、rewrap 复用数据密钥、导出前密码校验只解包数据密钥且不写 localStorage）、设备指纹稳定熵源与旧指纹保险库自动迁移（窗口尺寸变化不影响指纹；旧指纹解锁后重绑稳定指纹；指纹确实变化时报错而不是重试）、备份加密信封/篡改/换槽/锁定拒写/旧明文迁移、预览 XSS 净化、shoka 语法、GraphQL 批量读取/回退、GitHub 请求 no-store 缓存策略（REST tree/Contents 与 GraphQL）、本机文章缓存（路径/sha diff、AAD 绑定、锁定拒读、IDB 密文、跨仓库前缀清理、首次全量/未变化零读取/只读变更/失败重试/截断不删/配置签名变化/forceFull/并发/写入降级、A → B → A 切回不重读正文）、更新检查的节流/并发/失败静默、未保存备份的校验/快照/恢复映射/IndexedDB 上限/防抖与卸载清理/锁定前 flush、`updated`/`date` 排序与分页、检查中 pending 状态、i18n 语言标签归一化与检测回退、四语键集合/占位符/复数形状、插值与缺失键回退、`setCurrentLocale` 与 `useT` 联动、设置里 `locale` 的兼容解析。
- Live 测试覆盖：真实仓库读、批量读取（含 CJK 路径）、CRLF 写入/读回、创建/更新/过期 sha 冲突、删除、单提交移动、过期移动冲突、错误映射；真实的「首次全量 → 同树 unchanged 0 读取 → 远端新增 1 篇后只读该 blob」增量同步。
- E2E 覆盖：demo 工作台保存（含 toast X 关闭）、dashboard 全库 frontmatter 排序与 `updated`/`date` 切换、手机视口设置分区折叠、设置中增删字段并反映到编辑器、源文件模式改写整份文件后切回表单并保存、新稿本地起草后一次创建、按字段配置隐藏标题输入框（文件名必填、提交消息回退文件名）、手填 .mdx 创建并保留空格/CJK、手填非法名称留在对话框、非 .md/.mdx 后缀保留原名并给出非阻断提示、非法名称输入时立即 alert、移动直接提交（按钮进行中文案与 toast 状态）、失败留在对话框、`{title}` 提交模板、未保存备份的表单/源文件恢复、稍后恢复条、丢弃后不再提示、新稿刷新恢复；`repos.mock.spec.ts` 用 route 模拟 GitHub，验证两仓库独立 PAT（检查请求头）、添加后切换、仓库级提交模板隔离、锁定后一次密码解锁再切换、更新令牌和移除非活动仓库，以及 A → B → A 切回后没有第二次 GraphQL 正文读取、把内容根目录设为 `/` 后直接位于仓库根的文章（`abc.md`）出现在索引卡顶层并能打开编辑器；导出配置：demo 下载不含 PAT 且不出现密码输入，live 密码模式错密码不产生下载、正确密码下载的 JSON 含全部仓库 PAT 与各自配置、localStorage 不含明文 PAT；导入配置：修改导出 JSON 后选择文件、确认整体替换，表单与两仓库 PAT 生效、切仓库后新 PAT 用于请求、旧 PAT 移除、localStorage 不含明文 PAT；live 首访 1 次 tree + 1 次 GraphQL 批量、刷新后 0 次文章内容请求且 `abs-content` 中只有 AES-GCM 信封、新稿保存前 404 → 保存后 1 个 commit（parent 校验）、真实文件保存与回执、未保存草稿在 IDB 中是密文且锁定/解锁后可恢复；PWA 组验证 manifest/图标/SW 注册、断网从预缓存打开且 CacheStorage 里没有 `api.github.com`、新版本 waiting 时弹窗 → 「稍后」→ 顶栏徽标 → 「立即刷新」才 reload；`i18n.spec.ts` 用 `test.use({ locale })` 覆盖浏览器语言，验证 en-US / zh-TW / de-DE→en 的首次检测、`<html lang>`、Setup 切日本語后刷新保持、demo 设置切繁體後即时生效并持久化，以及 390px 无横向溢出。

## 手动 E2E 清单

（或用 `pnpm test:e2e`，见下）

1. `?demo=1` 打开工作台；展开索引、打开一篇笔记；改正文/标题；盖章保存；回工作台看提交小票。
2. 新建文章 → 检查目录、文件名、初始字段；确认此时仓库没有新文件；在编辑器盖章后才出现一次创建提交。把 title 设为非必填后再打开新建，确认标题框隐藏、文件名必填，`create` 模板的 `{title}` 回退文件名；手填 `我的 笔记.mdx`（原样保留、直接创建）、`note.txt`（提示但按 `note.txt` 创建）、`a/b.md` / `CON.md`（拒绝并留在对话框；输入非法名称后无需点「开始起草」就立即出现 alert）。
3. 设置 → 改提交模板/字号 → 保存；回工作台确认预览变化。
4. 真实模式：连接测试仓库 → 打开 `便笺-测试.md`（CRLF）→ 保存 → 回工作台看 GitHub 链接；在设置里锁定 → 重新加载 → 设备/密码解锁。用「密码 + 设备双因子」时确认刷新后必须输密码且不会自动解锁。设备指纹模式额外检查：改变浏览器窗口尺寸/缩放后刷新仍能自动解锁；旧版指纹保险库首次解锁后会自动迁移；如果指纹确实变了，页面只尝试一次并显示错误（不再卡在「校验设备…」）。
5. 移动：打开文件 → 移动 → 看到目标路径；点「移动并提交」立即在原对话框提交，按钮变为「正在移动并提交…」并出现进行中 toast；成功后 toast 且 URL 更新，目标已存在时错误留在对话框（同时有失败 toast）可直接改目标重试；不再有二次确认页。删除：AlertDialog；冲突场景（用 GitHub 网页端先改同一文件，再在应用里保存）。
6. 编辑器切到「源文件」→ 直接改 frontmatter 的引号/键顺序与正文 → 盖章 → 在 GitHub 看 diff 只有改动行、CRLF/BOM 保留；切回表单确认字段来自源文本；写入非法 YAML 时看到红色提示仍可保存。
7. 390px 视口：抽屉索引、编辑器、预览、设置；检查无横向滚动。
8. PWA：`pnpm build && pnpm preview` → 等 SW 安装完 → DevTools 切 Offline 刷新仍能开工作台；改一行 `dist/sw.js` 后 `registration.update()` → 弹窗出现 → 「稍后」看顶栏徽标 → 「立即刷新」；Edge/Chrome 地址栏可出现「安装」。
9. 未保存备份：改标题/正文或「源文件」内容 → 底栏出现「本机已备份」→ 刷新 → 弹窗「发现未保存的备份」→「稍后」出现恢复条 →「恢复」→ 内容回来且仍是「未保存」；再刷新 →「丢弃备份」→ 回到远端内容且不再弹窗。新稿同样刷新后恢复；保存/移动/删除后确认不再提示；设置里关闭备份并清除本仓库备份。
10. 加密备份：真实仓库里改标题 → `本机已备份` → DevTools → Application → IndexedDB → `abs-backups`，确认值是 `v: 2` 信封且搜不到文章标题/正文 → 顶栏锁定 → 输密码解锁 → 打开同一文件 → 恢复提示出现并能恢复；设置里“重置保险库”后确认本机真实仓库备份已清除。
11. 本机文章缓存：真实仓库首次打开看到「首次加载 · 正在读取全部文章」→ 解锁后刷新，Dashboard 只显示「正在检查远端更新…」且 Network 里没有 GraphQL 内容请求；DevTools → IndexedDB → `abs-content` 只有 `v: 1` 信封、搜不到标题/正文；在 GitHub 网页改/删/加一篇后点「检查更新」只读取变更；设置「强制全量更新」重新读取并显示进度；锁定 → 解锁后仍能直接看到列表；重置保险库后 `abs-content` 的 `live:` 记录被清空。
12. 多仓库：准备两个可访问仓库及各自 PAT；设置 → 仓库添加第二个仓库并确认自动切换；分别修改两个仓库的根目录/排除/Frontmatter 字段/提交模板并保存；来回切换时确认配置恢复、文章列表来自各自缓存；切回原仓库时 Network 只有 HEAD tree、无正文 GraphQL/Contents 读取；锁定后一次密码解锁可在两个仓库间继续切换；更新任一仓库 PAT 后请求头使用新令牌；移除非活动仓库后仓库列表与令牌清理；旧版单令牌保险库首次解锁可正常迁移。
13. 390px 设置：所有分区默认折叠，展开后可编辑并保存；1280px 默认全部展开；折叠时标题行摘要仍可见；无横向滚动。
14. Dashboard：切 `updated` / `date` 后首位文章按对应 frontmatter 时间变化；超过 20 篇时「加载更多」每次追加 20 篇，到底显示「已全部显示」；demo 的 9 篇不显示按钮。
15. 检查更新：Dashboard、设置页、索引卡三处点击后立即显示按钮禁用/「检查中…」「同步中…」、状态条进度与 loading toast；结束后才替换为成功/失败。
16. 图标：浏览器标签与 `apple-touch-icon` 都是 `/apple-touch-icon.png`。
17. 界面语言：用 en-US / zh-TW / ja 浏览器语言首次打开 `/#/setup`，确认自动选中对应语言且 `<html lang>` 同步；在 Setup 或设置「外观」切换语言，文案、toast 与校验错误即时变化，刷新/锁定后保持；de-DE 等回退英语；390px 下语言 select 不溢出。
18. 导出配置：demo 打开设置 →「配置导入与导出」→「导出配置」→ 警告说明不含 PAT、无密码输入 → 继续 → 下载 JSON 断言 `source: demo`、`tokens: {}`；live 密码模式 → 警告出现「文件包含明文 PAT」与仓库/PAT 数 → 继续 → 错密码留在框内且无文件 → 正确密码下载 JSON → 断言全部仓库 PAT 与各自配置；`localStorage` 搜不到明文；缺少某个仓库 PAT 时禁用继续；设置页有未保存改动时显示「只导出已保存配置」。
19. 导入配置：设置 →「配置导入与导出」→「导入配置」选择导出 JSON；确认条显示仓库/PAT 数并警告整体替换 → 确认 → 表单与仓库列表更新、toast「配置已导入」；切到各仓库确认新 PAT 生效、旧 PAT 被移除；demo 模式下导入按钮禁用并显示「演示模式不支持导入」；`localStorage` 搜不到导入的明文 PAT。

## Playwright 说明

`pnpm test:e2e` 使用 Playwright，当前配置走系统 **Microsoft Edge**（`channel: 'msedge'`），不需要下载浏览器。若机器没有 Edge，可 `pnpm exec playwright install chromium` 并把 `playwright.config.ts` 里的 channel 改为 `'chromium'`。首次运行会在 `tests/e2e/.auth/` 生成一个本地加密保险库状态（已 gitignore），live 组会创建并清理 `src/_e2e/*`。`repos.mock.spec.ts` 挂在 demo 组里，用 `page.route` 拦 GitHub API，不需要真实 token，也不会发出真实网络请求。全局 `use.locale` 固定为 `zh-CN`，现有中文定位不受浏览器语言影响；语言相关用例在 `tests/e2e/i18n.spec.ts` 里用 `test.use({ locale })` 覆盖。
