export type VaultMode = 'device' | 'password' | 'two-factor';

/** `legacy-mixed` only exists for vaults created before modes were split: both wraps present. */
export type VaultModeState = VaultMode | 'legacy-mixed';

export const MIN_VAULT_PASSWORD_LENGTH = 8;

export interface VaultModeOption {
  value: VaultMode;
  label: string;
  hint: string;
}

/**
 * Three explicit unlock modes. Selecting both factors is one mode, not two
 * checkboxes: `two-factor` means the password key is derived from the password
 * AND this device's fingerprint, and no independent device wrap is stored.
 */
export const VAULT_MODE_OPTIONS: ReadonlyArray<VaultModeOption> = [
  {
    value: 'device',
    label: '设备指纹',
    hint: '本机自动解锁，刷新后直接打开；共用电脑不建议。',
  },
  {
    value: 'password',
    label: '密码',
    hint: '每次新标签页输入密码；不绑定设备，换设备也能用。',
  },
  {
    value: 'two-factor',
    label: '密码 + 设备双因子',
    hint: '密码与本机指纹必须同时匹配；任一丢失只能重置保险库。',
  },
];

export function modeNeedsPassword(mode: VaultMode): boolean {
  return mode !== 'device';
}

export function vaultModeLabel(mode: VaultModeState | null): string {
  switch (mode) {
    case 'device':
      return '设备指纹自动解锁';
    case 'password':
      return '密码';
    case 'two-factor':
      return '密码 + 设备双因子';
    case 'legacy-mixed':
      return '旧版：密码或设备指纹';
    default:
      return '未配置';
  }
}
