import type { MessageTree } from '../../types';

const dialogs = {
  addRepo: {
    title: '添加仓库',
    description: '每个仓库保存自己的 PAT，但共用同一个保险库与解锁方式。添加后会立即切换到这个仓库。',
    repo: '仓库',
    repoHint: 'owner/repository 或 GitHub URL',
    branch: '分支',
    branchHint: '留空使用仓库默认分支',
    pat: 'PAT',
    patHint: '已有同仓库令牌时可留空',
    rootDir: '根目录',
    rootDirHint: '相对仓库根',
    excludes: '排除规则',
    excludesHint: '一行一条；前缀或 glob',
    note: '新仓库会先沿用当前仓库的扩展名、时区、索引并发、Frontmatter 字段与提交模板；这些配置之后按仓库独立保存。',
    repoRequired: '请先填写仓库。',
    submit: '校验并添加',
    busy: '校验并添加…',
    patFooter: 'PAT 只以密文写入本机保险库，不会出现在日志或 URL 里。',
  },
  repoToken: {
    title: '更新仓库令牌',
    description: '新 PAT 会加密保存到同一个保险库；同一仓库的其他分支也会使用它。',
    label: '新的 GitHub PAT',
    hint: '会先验证能否访问这个仓库',
    submit: '校验并更新',
    busy: '校验并保存…',
  },
  missingToken: {
    title: '这个仓库还没有可用令牌',
    descriptionBefore: '当前仓库',
    descriptionAfter: '的 PAT 不在保险库里。重新输入后它会被同一个保险库加密保存，不会影响其他仓库。',
    label: 'GitHub PAT',
    hint: '只保存在本机保险库',
    submit: '保存这个仓库的令牌',
    busy: '校验并保存…',
    lock: '锁定后从解锁页重置保险库',
  },
} satisfies MessageTree;

export type DialogsMessages = typeof dialogs;
export default dialogs;
