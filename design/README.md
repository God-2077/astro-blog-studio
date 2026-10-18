# 视觉方向选型

## 打开

- 直接打开 [`directions.html`](directions.html)：单个自包含 HTML，顶部切换 4 个方向 + 对比页。
- 夜间模式试验页：直接打开 [`night-mode.html`](night-mode.html)（单文件、字体已内嵌、无外部请求）。
- 或起一个本地静态服务（不依赖构建）：

  ```bash
  node scripts/serve-design.mjs design 4173
  # http://127.0.0.1:4173/
  ```

`directions.html` 的字体走 Google Fonts（Zen Maru Gothic / Sora / Shippori Mincho / DotGothic16 / Martian Mono / Sometype Mono）；离线时回退系统字体，布局与层级仍然成立。`night-mode.html` 不联网，Baloo 2 与 Sometype Mono 在构建时以 data URI 内嵌。

## 里面有什么

- **4 个方向**：01 樱糖手帐 / 02 夜樱电台 / 03 原稿纸 / 04 薄荷汽水。
- 每个方向 **5 个视图**：工作台 / 编辑器 / 设置 / 解锁 / 组件标本。
- 同一套**虚构样例数据**（仓库、分支、164 篇、草稿/置顶/加密、CRLF、API 余量），保证对比公平。
- **对比页**：色板、字体、形态、动效、签名交互、风险、对比度、我的看法。
- 点方向右上角「选择这个方向」会记住选择；也可以直接告诉我编号/名字。

没有真实文章、没有令牌、没有外部脚本。Google Fonts 是唯一的外部资源。

## 夜间模式实验

`night-mode.html` 是 01 樱糖手帐的**夜间版本实验页**，用于决定是否把夜间模式加入应用，本身不修改应用代码。

- **6 个视图**：工作台 / 编辑器 / 设置 / 组件标本 / 移动端 390 / 对照与判断。
- 右上角「夜 / 昼」切换整套 mock；`← / →` 翻视图；编辑器里的印章可以按，会盖章并弹出提交 toast。
- 「对照与判断」里有：并排对照、token 映射表、实测对比度（WCAG 2.2）、真实代码改动面清点、风险与对策、实施顺序与最小验证路径；配色已按首轮评审修订到 v2（危险色与品牌粉分开、粉色面积收敛、元数据/输入提亮、纸边加强），修订记录和未照做的取舍也写在这一页里。
- token 名沿用 `src/styles/app.css` 的 `--abs-*`，夜间只是同一组变量的另一组值；新增 `--abs-edge`、`--abs-input-line`、`--abs-on-accent`。
- 截图：`screenshots/night-workbench.png`、`night-editor.png`、`night-mobile.png`、`night-compare.png`。

源文件在 `night-mode.parts/`，改完重新生成：

```bash
node scripts/build-night-mode.mjs
```

## 重新生成

源文件在 `parts/`，生成脚本：

```bash
node scripts/build-directions.mjs
```

改设计时改 `parts/`，再重新生成 `directions.html`；不要只手改生成物。

## 选型之后

选定方向后写 `DECISION.md` 的六段式契约（THESIS / OWN-WORLD / STORY / FIRST VIEWPORT / FORM / FINISH），然后进入 React 应用实现。

## 边界

- 这是**设计原型**，用于比较视觉方向，不是最终应用；交互只覆盖选型需要的部分。
- 不使用动漫角色立绘、参考站素材、第三方图标瓷砖。
- 编辑区不做纹理/旋转/入场动画；动效尊重 `prefers-reduced-motion`。
- 夜间模式是实验方向，是否进入应用由 `night-mode.html` 的对照与判断决定；不要把它当作已实现的功能。
