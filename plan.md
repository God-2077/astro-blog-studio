## 创建浏览器端纯前端应用 astro-blog-studio

在前端基于 GitHub API 和 PAT，实现对博客文章（Markdown 格式）的管理。

博客文章仓库结构参考: astro-blog-content/src

### 框架

首选 React + TypeScript + Vite + Octokit

你觉得有其它更好的框架，可以向我提建议。

### 配置项

**令牌配置**
- PAT 令牌会加密存储在 localStorage 中。
- 加密密钥为浏览器指纹（FingerprintJS）；也支持单独设置密码，并在每次打开网站时验证。

**仓库地址**
- 用于存放博客文章的仓库地址。
- 示例：`username/repository`

**文章根目录**
- 用于存放博客文章的根目录。
- 示例：`src`

**排除的文件或目录（list）**
- 用于排除部分文件或目录。
- 示例：
  - `src/content/blog/en`
  - `src/content/blog/ja`
  - `src/content/page/en`
  - `src/content/page/ja`

**commit 消息**
- 提交文件时使用的 commit 消息模板。
- 示例：
  - create：`create: {path}`
  - update：`update: {path}`
  - delete：`delete: {path}`

**其他配置项**
- 一些可能需要配置的选项。


### 功能

基于文件系统的博客文章管理功能。

基础功能：
- 列出文件列表
- 查看文件
- 更新文件
- 新增文件
- 删除文件

可以在此基础上扩展更多功能。

### UI 设计

基于 impeccable 与 distinctive-ai-design 两项 skills，设计一套兼具风格辨识度、创意表达与简洁性的二次元粉红色 UI。视觉调性参考 iamyukino.cn 的柔和粉彩与轻量二次元氛围，重点规避通用 AI 模板化的“标准脸”审美，保持界面本身的设计性格。

工作流分两步推进：
1. 先产出 3 个以上视觉方向不同的 HTML 示例，在色彩关系、卡片形态、装饰语言与动效节奏等方面形成差异，供对比挑选；
2. 确认方向后，再基于选定方案做完整实现与细节打磨。