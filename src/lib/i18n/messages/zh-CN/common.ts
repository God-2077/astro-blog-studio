import type { MessageTree } from '../../types';

const common = {
  language: '界面语言',
  confirm: '确认',
  cancel: '取消',
  save: '保存',
  close: '关闭',
  back: '返回',
  retry: '重试',
  loading: '加载中',
  loadingEditor: '加载编辑器',
  copy: '复制',
  copied: '已复制',
  delete: '删除',
  edit: '编辑',
  add: '添加',
  remove: '移除',
  open: '打开',
  closeToast: '关闭提示',
  themeLabel: '主题',
  theme: {
    system: { label: '跟随系统', hint: '系统深浅色变化时自动跟随' },
    day: { label: '昼', hint: '暖纸日间桌面' },
    night: { label: '夜', hint: '暖墨夜纸，不是纯黑反转' },
  },
  vaultMode: {
    device: { label: '设备指纹', hint: '本机自动解锁，刷新后直接打开；共用电脑不建议。', autoLabel: '设备指纹自动解锁' },
    password: { label: '密码', hint: '每次新标签页输入密码；不绑定设备，换设备也能用。' },
    twoFactor: { label: '密码 + 设备双因子', hint: '密码与本机指纹必须同时匹配；任一丢失只能重置保险库。' },
    legacy: '旧版：密码或设备指纹',
    none: '未配置',
  },
  fieldHint: {
    description: 'SEO / 列表摘要',
    link: '自定义 URL slug',
    cover: '封面图片路径',
    categories: '用 > 表示层级',
    hideFrom: 'home / home_rss / rss / all',
  },
  noDate: '无日期',
  untitled: '无标题',
  units: {
    words: { one: '{count} 字', other: '{count} 字' },
    readingTime: { one: '{count} 分钟', other: '{count} 分钟' },
  },
  passwordMinLength: { one: '至少 {count} 位', other: '至少 {count} 位' },
  appDescription:
    '浏览器端、纯前端的 Markdown 博客工作台：直接用 GitHub API 读写内容仓库，没有后端服务器，令牌只在这台设备上加密保存。',
} satisfies MessageTree;

export type CommonMessages = typeof common;
export default common;
