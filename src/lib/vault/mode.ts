import { t } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

export type VaultMode = 'device' | 'password' | 'two-factor';

/** `legacy-mixed` only exists for vaults created before modes were split: both wraps present. */
export type VaultModeState = VaultMode | 'legacy-mixed';

export const MIN_VAULT_PASSWORD_LENGTH = 8;

export interface VaultModeOption {
  value: VaultMode;
  labelKey: MessageKey;
  hintKey: MessageKey;
}

/**
 * Three explicit unlock modes. Selecting both factors is one mode, not two
 * checkboxes: `two-factor` means the password key is derived from the password
 * AND this device's fingerprint, and no independent device wrap is stored.
 */
export const VAULT_MODE_OPTIONS: ReadonlyArray<VaultModeOption> = [
  {
    value: 'device',
    labelKey: 'common.vaultMode.device.label',
    hintKey: 'common.vaultMode.device.hint',
  },
  {
    value: 'password',
    labelKey: 'common.vaultMode.password.label',
    hintKey: 'common.vaultMode.password.hint',
  },
  {
    value: 'two-factor',
    labelKey: 'common.vaultMode.twoFactor.label',
    hintKey: 'common.vaultMode.twoFactor.hint',
  },
];

export function modeNeedsPassword(mode: VaultMode): boolean {
  return mode !== 'device';
}

export function vaultModeLabel(mode: VaultModeState | null): string {
  switch (mode) {
    case 'device':
      return t('common.vaultMode.device.autoLabel');
    case 'password':
      return t('common.vaultMode.password.label');
    case 'two-factor':
      return t('common.vaultMode.twoFactor.label');
    case 'legacy-mixed':
      return t('common.vaultMode.legacy');
    default:
      return t('common.vaultMode.none');
  }
}
