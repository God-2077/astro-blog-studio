# 视觉方向选型

## 打开

- 直接打开 [`directions.html`](directions.html)：单个自包含 HTML，顶部切换 4 个方向 + 对比页。
- 或起一个本地静态服务（不依赖构建）：

  ```bash
  node scripts/serve-design.mjs design 4173
  # http://127.0.0.1:4173/
  ```

字体走 Google Fonts（Zen Maru Gothic / Sora / Shippori Mincho / DotGothic16 / Martian Mono / Sometype Mono）；离线时回退系统字体，布局与层级仍然成立。

## 里面有什么

- **4 个方向**：01 樱糖手帐 / 02 夜樱电台 / 03 原稿纸 / 04 薄荷汽水。
- 每个方向 **5 个视图**：工作台 / 编辑器 / 设置 / 解锁 / 组件标本。
- 同一套**虚构样例数据**（仓库、分支、164 篇、草稿/置顶/加密、CRLF、API 余量），保证对比公平。
- **对比页**：色板、字体、形态、动效、签名交互、风险、对比度、我的看法。
- 点方向右上角「选择这个方向」会记住选择；也可以直接告诉我编号/名字。

没有真实文章、没有令牌、没有外部脚本。Google Fonts 是唯一的外部资源。

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
