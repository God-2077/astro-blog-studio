import type { SetupMessages } from '../zh-CN/setup';

const setup: SetupMessages = {
  eyebrow: 'first run',
  title: '把儲存庫接進來',
  intro:
    '權杖只會在這台裝置上加密儲存。設定成功後，這個工作室會直接讀寫儲存庫裡的 Markdown；之後可在設定裡新增更多儲存庫，每個儲存庫用自己的 PAT，共用同一套解鎖方式。',
  pat: {
    label: 'GitHub PAT',
    hint: 'Fine-grained: Contents 讀寫 + Metadata 讀',
  },
  repo: {
    label: '儲存庫',
    hint: 'owner/repository 或 GitHub URL',
  },
  branch: {
    label: '分支',
    hint: '留空使用儲存庫預設分支',
  },
  rootDir: {
    label: '文章根目錄',
  },
  excludes: {
    label: '排除規則',
    hint: '一行一條；前綴或 glob',
  },
  unlockMode: {
    title: '解鎖方式',
    password: {
      label: '密碼',
      hint: '至少 {count} 位；忘記只能重設保險庫並重新輸入 PAT',
      placeholder: '設定一個密碼',
    },
  },
  error: {
    tokenRequired: '請先貼上 GitHub PAT。',
    repoInvalid: '儲存庫格式應為 owner/repository，或完整的 GitHub URL。',
    passwordTooShort: '密碼至少 {count} 位。',
  },
  submit: {
    idle: '連線儲存庫',
    busy: '驗證並加密…',
  },
  demo: '先看示範',
  createToken: '建立 fine-grained token ↗',
  storage: {
    title: '權杖怎麼儲存',
    body: '每個儲存庫的 PAT 分別用 AES-GCM 封裝，共用同一個資料金鑰；資料金鑰再由裝置指紋或密碼經 PBKDF2 衍生的金鑰包裝。雙因子時密碼與指紋會一起參與衍生，兩者缺一不可。權杖只以密文存在 localStorage，解鎖前不會進入網路請求。',
    note: '裝置指紋不是秘密；密碼才是真正的安全邊界。換裝置或指紋變更後，雙因子只能重設保險庫。',
  },
  blog: {
    title: '人家的部落格喵',
    intro: '想先偷偷瞄一眼人家的部落格嘛喵~ ',
    hint: '快戳 blog.ksable.top 來玩玩呀 (｡･ω･｡)ﾉ♡',
  },
};

export default setup;
