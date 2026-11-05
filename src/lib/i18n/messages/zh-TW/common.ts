import type { CommonMessages } from '../zh-CN/common';

const common: CommonMessages = {
  language: '介面語言',
  confirm: '確認',
  cancel: '取消',
  save: '儲存',
  close: '關閉',
  back: '返回',
  retry: '重試',
  loading: '載入中',
  loadingEditor: '載入編輯器',
  copy: '複製',
  copied: '已複製',
  delete: '刪除',
  edit: '編輯',
  add: '新增',
  remove: '移除',
  open: '開啟',
  closeToast: '關閉提示',
  themeLabel: '主題',
  theme: {
    system: { label: '跟隨系統', hint: '系統深淺色變化時自動跟隨' },
    day: { label: '晝', hint: '暖紙日間桌面' },
    night: { label: '夜', hint: '暖墨夜紙，不是純黑反轉' },
  },
  vaultMode: {
    device: { label: '裝置指紋', hint: '本機自動解鎖，重新整理後直接開啟；共用電腦不建議。', autoLabel: '裝置指紋自動解鎖' },
    password: { label: '密碼', hint: '每次新分頁輸入密碼；不綁定裝置，換裝置也能用。' },
    twoFactor: { label: '密碼 + 裝置雙因子', hint: '密碼與本機指紋必須同時相符；任一遺失只能重設保險庫。' },
    legacy: '舊版：密碼或裝置指紋',
    none: '未設定',
  },
  fieldHint: {
    description: 'SEO / 清單摘要',
    link: '自訂 URL slug',
    cover: '封面圖片路徑',
    categories: '用 > 表示層級',
    hideFrom: 'home / home_rss / rss / all',
  },
  noDate: '無日期',
  untitled: '無標題',
  units: {
    words: { one: '{count} 字', other: '{count} 字' },
    readingTime: { one: '{count} 分鐘', other: '{count} 分鐘' },
  },
  passwordMinLength: { one: '至少 {count} 位', other: '至少 {count} 位' },
  appDescription:
    '瀏覽器端、純前端的 Markdown 部落格工作室：直接用 GitHub API 讀寫內容儲存庫，沒有後端伺服器，權杖只在這個裝置上加密儲存。',
};

export default common;
