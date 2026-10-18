import type { RepoInfo } from '@/lib/github/types';

export interface DemoFile {
  path: string;
  text: string;
}

export const demoRepo: RepoInfo = {
  owner: 'God-2077',
  name: 'astro-blog-content',
  defaultBranch: 'main',
  private: true,
  canPush: true,
  htmlUrl: 'https://github.com/God-2077/astro-blog-content',
};

export const demoContentConfig = {
  rootDir: 'src',
  extensions: ['.md', '.mdx'],
  excludes: ['src/content/blog/en', 'src/content/blog/ja', 'src/pages/en', 'src/pages/ja'],
  timezone: 'Asia/Shanghai',
};

interface PostInput {
  title: string;
  date: string;
  updated?: string;
  categories?: string[];
  tags?: string[];
  draft?: boolean;
  sticky?: boolean;
  password?: string;
  body: string;
}

function post({ title, date, updated, categories = [], tags = [], draft, sticky, password, body }: PostInput): string {
  const lines = ['---', `title: '${title.replaceAll("'", "''")}'`, `date: '${date}'`];
  if (updated) lines.push(`updated: '${updated}'`);
  if (sticky) lines.push('sticky: true');
  if (draft) lines.push('draft: true');
  if (password) lines.push(`password: '${password}'`);
  if (tags.length) {
    lines.push('tags:');
    for (const tag of tags) lines.push(`- ${tag}`);
  }
  if (categories.length) {
    lines.push('categories:');
    for (const category of categories) lines.push(`- ${category}`);
  }
  lines.push('---', '', body.trim(), '');
  return lines.join('\n');
}

const markdownNote = post({
  title: '便笺：Markdown 备忘单',
  date: '2024-07-21 20:10:28',
  updated: '2026-10-17 23:48:00',
  categories: ['笔记', '备忘'],
  tags: ['Markdown', '备忘', '语法'],
  sticky: true,
  body: `## 为什么要记备忘单

每次写文章都要翻一次语法，索性把常用的几条钉在这里。
写完就忘的，通常不是语法，是当时想写的那句话。

<!-- 下面这段是从旧便笺里搬来的 -->
- 标题：\`## 二级标题\`
- 强调：**粗体** / *斜体* / ==高亮==
- 剧透：!!点开才看得见!!
- 数学：$E = mc^2$

### 表格与代码

| 场景 | 语法 |
| --- | --- |
| 表格 | \`| a | b |\` |
| 代码 | 三个反引号 + 语言名 |

\`\`\`ts
const studio = {
  repo: 'astro-blog-content',
  branch: 'main',
  eol: 'crlf',
};
\`\`\`

### 一条给自己的规矩

先写，再排版；先保存，再纠结。
`,
});

const demoFiles: DemoFile[] = [
  {
    path: 'src/content/blog/note/便笺-Markdown-备忘单.md',
    text: markdownNote.replaceAll('\n', '\r\n'),
  },
  {
    path: 'src/content/blog/note/便笺-2024-07-21-归档页面修改.md',
    text: post({
      title: '便笺：归档页面修改',
      date: '2024-07-21 21:02:00',
      categories: ['笔记'],
      tags: ['Astro'],
      body: `把归档页面的年份分组改成按更新时间倒序，顺手把空分组隐藏掉。

\`\`\`ts
const groups = posts.reduce<Record<string, Post[]>>((acc, post) => {
  const key = post.date.slice(0, 4);
  (acc[key] ??= []).push(post);
  return acc;
}, {});
\`\`\`
`,
    }),
  },
  {
    path: 'src/content/blog/note/便笺-git-与-patch.md',
    text: post({
      title: '便笺：git 与 patch',
      date: '2024-06-30 18:09:00',
      categories: ['笔记'],
      tags: ['git'],
      password: 'studio',
      body: '生成 patch、应用 patch，以及失败时如何回退。这里放一段占位内容。\n',
    }),
  },
  {
    path: 'src/content/blog/post/Posts-本站的壁纸.md',
    text: post({
      title: 'Posts：本站的壁纸',
      date: '2024-06-29 20:10:28',
      categories: ['文章'],
      tags: ['壁纸', '二次元'],
      body: `本站用的几张壁纸，都是很喜欢的色调。

![wallpaper](https://assets.example.com/wallpapers/one.jpg)

![wallpaper](https://assets.example.com/wallpapers/two.jpg)
`,
    }),
  },
  {
    path: 'src/content/blog/post/posts-使用-Service-Worker-缓存网站资源.md',
    text: post({
      title: 'posts：使用 Service Worker 缓存网站资源',
      date: '2024-06-18 22:15:00',
      categories: ['文章'],
      tags: ['Service Worker', '性能'],
      body: `先把静态资源缓存起来，再考虑离线页面。

\`\`\`js
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('v1').then((cache) => cache.addAll(['/'])));
});
\`\`\`
`,
    }),
  },
  {
    path: 'src/content/blog/reads/读书笔记-余华的《第七天》.md',
    text: post({
      title: '读书笔记：余华的《第七天》',
      date: '2024-06-12 01:03:00',
      categories: ['读书笔记'],
      tags: ['余华', '小说'],
      draft: true,
      body: '第七天里，死去的人在另一个世界排队。读完以后很久没有缓过来。\n',
    }),
  },
  {
    path: 'src/content/blog/ssn/碎碎念-2024-05-06.md',
    text: post({
      title: '碎碎念 · 2024-05-06',
      date: '2024-05-06 23:59:00',
      categories: ['碎碎念'],
      body: '今天什么也没做，但把桌面收拾干净了。\n',
    }),
  },
  {
    path: 'src/content/blog/ssn/碎碎念-2024-05-08.md',
    text: post({
      title: '碎碎念 · 2024-05-08',
      date: '2024-05-08 22:20:00',
      categories: ['碎碎念'],
      body: '楼下的花开了，拍了一张，但懒得修。\n',
    }),
  },
  {
    path: 'src/pages/about.md',
    text: post({
      title: '关于',
      date: '2024-01-01 00:00:00',
      body: '这里是一个安静的小站。\n',
    }),
  },
  {
    path: 'src/content/blog/en/hello-world.md',
    text: post({
      title: 'Hello World',
      date: '2024-01-01 00:00:00',
      body: 'This file should be hidden by the exclusion rules.\n',
    }),
  },
  {
    path: 'src/content/blog/ja/hello-world.md',
    text: post({
      title: 'こんにちは',
      date: '2024-01-01 00:00:00',
      body: 'このファイルは除外される。\n',
    }),
  },
  {
    path: 'src/pages/en/about.md',
    text: post({
      title: 'About',
      date: '2024-01-01 00:00:00',
      body: 'Excluded page.\n',
    }),
  },
];

export const demoSeed: Record<string, string> = Object.fromEntries(demoFiles.map((file) => [file.path, file.text]));
