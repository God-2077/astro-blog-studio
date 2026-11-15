import type { DialogsMessages } from '../zh-CN/dialogs';

const dialogs: DialogsMessages = {
  addRepo: {
    title: '新增儲存庫',
    description: '每個儲存庫儲存自己的 PAT，但共用同一個保險庫與解鎖方式。新增後會立即切換到這個儲存庫。',
    repo: '儲存庫',
    repoHint: 'owner/repository 或 GitHub URL',
    kind: '儲存庫類型',
    presetNote: '切換類型會套用對應的根目錄與排除規則，仍可手動調整。',
    branch: '分支',
    branchHint: '留空使用儲存庫預設分支',
    pat: 'PAT',
    patHint: '已有同儲存庫權杖時可留空',
    rootDir: '根目錄',
    rootDirHint: '相對於儲存庫根目錄',
    daybookRootHint: 'Daybook 通常留空，表示儲存庫根目錄',
    repoRootPlaceholder: '儲存庫根目錄（留空）',
    excludes: '排除規則',
    excludesHint: '一行一條；前綴或 glob',
    note: '新儲存庫會先沿用目前儲存庫的時區、索引並行度與提交範本；根目錄、排除規則與 Frontmatter 欄位會依所選類型預填，之後依儲存庫獨立儲存。',
    repoRequired: '請先填寫儲存庫。',
    submit: '驗證並新增',
    busy: '驗證並新增…',
    patFooter: 'PAT 只會以密文寫入本機保險庫，不會出現在日誌或 URL 裡。',
  },
  repoToken: {
    title: '更新儲存庫權杖',
    description: '新 PAT 會加密儲存到同一個保險庫；同一儲存庫的其他分支也會使用它。',
    label: '新的 GitHub PAT',
    hint: '會先驗證能否存取這個儲存庫',
    submit: '驗證並更新',
    busy: '驗證並儲存…',
  },
  missingToken: {
    title: '這個儲存庫還沒有可用權杖',
    descriptionBefore: '目前儲存庫',
    descriptionAfter: '的 PAT 不在保險庫裡。重新輸入後會被同一個保險庫加密儲存，不會影響其他儲存庫。',
    label: 'GitHub PAT',
    hint: '只儲存在本機保險庫',
    submit: '儲存這個儲存庫的權杖',
    busy: '驗證並儲存…',
    lock: '鎖定後從解鎖頁重設保險庫',
  },
};

export default dialogs;
