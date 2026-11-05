import type { MessageTree } from '../../types';

const unlock = {
  seal: '樱',
  title: '欢迎回来',
  modeDescription: {
    device: '保险库还在这台设备上。正在用指纹揭开封印。',
    password: '保险库还在这台设备上。输入密码揭开封印。',
    twoFactor: '双因子已开启：密码，加上与设置时一致的本机指纹，两者都匹配才能揭开。',
    legacyMixed: '这是旧版保险库：密码或设备指纹任一即可解锁。建议在设置里升级为双因子。',
    unknown: '保险库记录不完整，无法判断解锁方式；请重置后重新输入 PAT。',
  },
  password: {
    label: 'password',
    aria: '密码',
  },
  submit: {
    idle: '揭开封印',
    busy: '验证中…',
  },
  deviceUnlock: {
    idle: '用设备指纹解锁',
    busy: '校验设备…',
  },
  legacyDeviceUnlock: '旧版：用设备指纹解锁',
  twoFactorNote: '双因子需要同一台设备的指纹。换设备或指纹变化后无法找回，只能重置保险库；本机真实仓库的备份会一起清除。',
  footer: {
    line1: '令牌只在本机解密 · 锁定即清空内存与缓存',
    line2: '忘记密码 = 重新输入 PAT',
  },
  reset: '重置保险库',
  resetConfirm: {
    message:
      '重置保险库会删除本机所有仓库的 PAT 与仓库列表，并清除本机所有真实仓库的未保存备份、草稿和文章缓存；当前内容/字段/提交模板会保留为下次配置的默认值。需要重新输入 PAT。继续吗？',
    description: 'GitHub 上的文章不受影响；未提交到仓库的本机内容无法找回。',
  },
  aside: {
    device: {
      title: '设备绑定',
      body: '指纹只在本机计算，不发送到任何服务器。',
    },
    twoFactor: {
      title: '双因子是 AND',
      body: '密码与指纹必须同时匹配；不是任选其一。',
    },
    readOnly: {
      title: '只读也安心',
      body: '只读令牌不会显示任何写操作。',
    },
  },
  demo: '先看演示',
  modePicker: {
    legend: '解锁方式',
    twoFactorWarning:
      '必须同时满足密码与本机指纹；换设备、清除浏览器数据或指纹变化后都无法解锁，只能重置保险库并重新输入 PAT，本机真实仓库的未保存备份也会被清除。',
  },
} satisfies MessageTree;

export type UnlockMessages = typeof unlock;
export default unlock;
