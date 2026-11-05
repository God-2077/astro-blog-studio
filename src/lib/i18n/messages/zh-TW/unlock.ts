import type { UnlockMessages } from '../zh-CN/unlock';

const unlock: UnlockMessages = {
  seal: '櫻',
  title: '歡迎回來',
  modeDescription: {
    device: '保險庫還在這台裝置上。正在用指紋揭開封印。',
    password: '保險庫還在這台裝置上。輸入密碼揭開封印。',
    twoFactor: '雙因子已開啟：密碼，加上與設定時一致的本機指紋，兩者都相符才能揭開。',
    legacyMixed: '這是舊版保險庫：密碼或裝置指紋任一即可解鎖。建議在設定裡升級為雙因子。',
    unknown: '保險庫記錄不完整，無法判斷解鎖方式；請重設後重新輸入 PAT。',
  },
  password: {
    label: 'password',
    aria: '密碼',
  },
  submit: {
    idle: '揭開封印',
    busy: '驗證中…',
  },
  deviceUnlock: {
    idle: '用裝置指紋解鎖',
    busy: '驗證裝置…',
  },
  legacyDeviceUnlock: '舊版：用裝置指紋解鎖',
  twoFactorNote: '雙因子需要同一台裝置的指紋。換裝置或指紋變更後無法找回，只能重設保險庫；本機真實儲存庫的備份會一起清除。',
  footer: {
    line1: '權杖只在本機解密 · 鎖定即清空記憶體與快取',
    line2: '忘記密碼 = 重新輸入 PAT',
  },
  reset: '重設保險庫',
  resetConfirm: {
    message:
      '重設保險庫會刪除本機所有儲存庫的 PAT 與儲存庫清單，並清除本機所有真實儲存庫的未儲存備份、草稿和文章快取；目前的內容/欄位/提交範本會保留為下次設定的預設值。需要重新輸入 PAT。要繼續嗎？',
    description: 'GitHub 上的文章不受影響；未提交到儲存庫的本機內容無法找回。',
  },
  aside: {
    device: {
      title: '裝置綁定',
      body: '指紋只在本機計算，不會傳送到任何伺服器。',
    },
    twoFactor: {
      title: '雙因子是 AND',
      body: '密碼與指紋必須同時相符；不是任選其一。',
    },
    readOnly: {
      title: '唯讀也安心',
      body: '唯讀權杖不會顯示任何寫入操作。',
    },
  },
  demo: '先看示範',
  modePicker: {
    legend: '解鎖方式',
    twoFactorWarning:
      '必須同時滿足密碼與本機指紋；換裝置、清除瀏覽器資料或指紋變更後都無法解鎖，只能重設保險庫並重新輸入 PAT，本機真實儲存庫的未儲存備份也會被清除。',
  },
};

export default unlock;
