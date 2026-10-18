# 方向决策：01 樱糖手帐（Sugar Stationery）

选定日期：2026-10-18
选定方式：用户直接选择 01（四方向决策台：`design/directions.html`）
参考：决策台 `01` 的工作台 / 编辑器 / 设置 / 解锁 / 组件五个视图。

## 方向契约

**THESIS**：把博客编辑做成一张摊在桌上的手帐纸：文件是索引卡，编辑是纸，提交是盖章。拒绝通用仪表盘的卡片网格，也拒绝把可爱做成噪音。

**OWN-WORLD**：暖纸 `#FFFBF5`、桌面 `#F6EDE6`、腮红 `#F7DDE5`、樱 `#C93F6D`、薄荷 `#A8E0CF`、黄油 `#FFE9AE`、墨 `#3D2F36`。1.5–2px 墨线、18–22px 圆角、3–5px 硬偏移阴影、纸胶带、索引卡、圆形印章。展示面圆体、正文系统中文、数据等宽。编辑器内部无纹理、无描边、无旋转。

**STORY**：打开就知道今天改哪张卡；点开文件像抽出一张纸；改完盖章，收到一张提交小票；出错时知道下一步，而不是等一个通用错误弹窗。

**FIRST VIEWPORT**：左侧一叠带标签页的索引卡，中间桌面区放「今天写点什么」、三张便签统计和最近清单，右侧提交小票、今日小目标、API 状态；唯一的实心樱粉按钮是「新建文章」。编辑区是整块安静的白纸，印章是唯一的红。

**FORM**：手帐/索引卡系统，四个候选中第 1 个；`seed: none (unavailable)`——impeccable context 加载器在本机挂起，按降级流程直接写 PRODUCT.md / BRIEF.md 并手工推导。

**FINISH**：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## 实施备注

- 方向契约只留在本文件，不进入应用源码、DOM、data 属性或构建产物。
- 编辑区硬规则：无背景纹理、无旋转、无入场动画；动效只用于状态变化，且尊重 `prefers-reduced-motion`。
- 字体：拉丁展示面自托管；中文正文系统栈；CJK 圆体仅在用户本机存在时生效，不引入多 MB 字体。完整圆体字形保留在决策台原型里。
- 装饰只在手壳、侧栏、空状态、解锁页；文件树与编辑器保持可长时间阅读。
- 实现完成后从成品写 DESIGN.md，并跑两轮截图评审 + `impeccable detect`。
