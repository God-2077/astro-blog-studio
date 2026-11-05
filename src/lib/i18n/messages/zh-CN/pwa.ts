import type { MessageTree } from '../../types';

const pwa = {
  offlineReady: '已缓存，断网也能打开',
  title: '网站有新版本',
  description: '新版本已经准备好，刷新页面即可使用；页面里未保存的改动会丢失。',
  dirty: '编辑器里有未保存的修改，建议先保存再刷新。',
  later: '稍后',
  refreshNow: '立即刷新',
  refreshing: '刷新中…',
} satisfies MessageTree;

export type PwaMessages = typeof pwa;
export default pwa;
