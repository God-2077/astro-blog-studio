import type { MessageTree } from '../../types';

const setup = {
  eyebrow: 'first run',
  title: '把仓库接进来',
  intro:
    '令牌只会在这台设备上加密保存。配置成功后，这个工作台会直接读写仓库里的 Markdown；之后可在设置里添加更多仓库，每个仓库用自己的 PAT，共用同一套解锁方式。',
  pat: {
    label: 'GitHub PAT',
    hint: 'Fine-grained: Contents 读写 + Metadata 读',
  },
  repo: {
    label: '仓库',
    hint: 'owner/repository 或 GitHub URL',
  },
  branch: {
    label: '分支',
    hint: '留空使用仓库默认分支',
  },
  rootDir: {
    label: '文章根目录',
  },
  excludes: {
    label: '排除规则',
    hint: '一行一条；前缀或 glob',
  },
  unlockMode: {
    title: '解锁方式',
    password: {
      label: '密码',
      hint: '至少 {count} 位；忘记只能重置保险库并重输 PAT',
      placeholder: '设置一个密码',
    },
  },
  error: {
    tokenRequired: '请先粘贴 GitHub PAT。',
    repoInvalid: '仓库格式应为 owner/repository，或完整的 GitHub URL。',
    passwordTooShort: '密码至少 {count} 位。',
  },
  submit: {
    idle: '连接仓库',
    busy: '校验并加密…',
  },
  demo: '先看演示',
  createToken: '创建 fine-grained token ↗',
  storage: {
    title: '令牌怎么存',
    body: '每个仓库的 PAT 分别用 AES-GCM 封装，共用同一个数据密钥；数据密钥再由设备指纹或密码经 PBKDF2 派生的密钥包装。双因子时密码与指纹会一起参与派生，两者缺一不可。令牌只以密文存在 localStorage，解锁前不会进入网络请求。',
    note: '设备指纹不是秘密；密码才是真正的安全边界。换设备或指纹变化后，双因子只能重置保险库。',
  },
  blog: {
    title: '人家的博客喵',
    intro: '想先偷偷瞄一眼人家的博客嘛喵~ ',
    hint: '快戳 blog.ksable.top 来玩玩呀 (｡･ω･｡)ﾉ♡',
  },
} satisfies MessageTree;

export type SetupMessages = typeof setup;
export default setup;
