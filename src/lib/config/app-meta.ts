import { version } from '../../../package.json';

/** 应用名与项目地址（页脚、Setup 侧栏共用）。 */
export const APP_NAME = 'Astro Blog Studio';

export const APP_URL = 'https://github.com/God-2077/astro-blog-studio';

/** 链接的展示文本：去掉协议，保持 mono 小字一行的长度。 */
export const APP_URL_LABEL = APP_URL.replace(/^https?:\/\//, '');

export const APP_DESCRIPTION =
  '浏览器端、纯前端的 Markdown 博客工作台：直接用 GitHub API 读写内容仓库，没有后端服务器，令牌只在这台设备上加密保存。';

/** 版本号来自根 package.json，构建时内联；升级版本只改 package.json 一处。 */
export const APP_VERSION: string = version;
