import type { Locale } from '../locale';
import type { DeepMessageKey } from '../types';
import enCommon from './en/common';
import enDashboard from './en/dashboard';
import enDialogs from './en/dialogs';
import enEditor from './en/editor';
import enErrors from './en/errors';
import enPwa from './en/pwa';
import enSettings from './en/settings';
import enSetup from './en/setup';
import enShell from './en/shell';
import enUnlock from './en/unlock';
import jaCommon from './ja/common';
import jaDashboard from './ja/dashboard';
import jaDialogs from './ja/dialogs';
import jaEditor from './ja/editor';
import jaErrors from './ja/errors';
import jaPwa from './ja/pwa';
import jaSettings from './ja/settings';
import jaSetup from './ja/setup';
import jaShell from './ja/shell';
import jaUnlock from './ja/unlock';
import common from './zh-CN/common';
import dashboard from './zh-CN/dashboard';
import dialogs from './zh-CN/dialogs';
import editor from './zh-CN/editor';
import errors from './zh-CN/errors';
import pwa from './zh-CN/pwa';
import settings from './zh-CN/settings';
import setup from './zh-CN/setup';
import shell from './zh-CN/shell';
import unlock from './zh-CN/unlock';
import zhTWCommon from './zh-TW/common';
import zhTWDashboard from './zh-TW/dashboard';
import zhTWDialogs from './zh-TW/dialogs';
import zhTWEditor from './zh-TW/editor';
import zhTWErrors from './zh-TW/errors';
import zhTWPwa from './zh-TW/pwa';
import zhTWSettings from './zh-TW/settings';
import zhTWSetup from './zh-TW/setup';
import zhTWShell from './zh-TW/shell';
import zhTWUnlock from './zh-TW/unlock';

const zhCN = { common, dashboard, dialogs, editor, errors, pwa, settings, setup, shell, unlock };
const en = {
  common: enCommon,
  dashboard: enDashboard,
  dialogs: enDialogs,
  editor: enEditor,
  errors: enErrors,
  pwa: enPwa,
  settings: enSettings,
  setup: enSetup,
  shell: enShell,
  unlock: enUnlock,
};
const ja = {
  common: jaCommon,
  dashboard: jaDashboard,
  dialogs: jaDialogs,
  editor: jaEditor,
  errors: jaErrors,
  pwa: jaPwa,
  settings: jaSettings,
  setup: jaSetup,
  shell: jaShell,
  unlock: jaUnlock,
};
const zhTW = {
  common: zhTWCommon,
  dashboard: zhTWDashboard,
  dialogs: zhTWDialogs,
  editor: zhTWEditor,
  errors: zhTWErrors,
  pwa: zhTWPwa,
  settings: zhTWSettings,
  setup: zhTWSetup,
  shell: zhTWShell,
  unlock: zhTWUnlock,
};

export type Messages = typeof zhCN;
export type MessageKey = DeepMessageKey<Messages>;

/** 四语词典；类型强制每个语言与简体中文同构，缺键/多键都会编译失败。 */
const catalogs: Record<Locale, Messages> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ja,
  en,
};

export function catalogFor(locale: Locale): Messages {
  return catalogs[locale];
}
