import { create } from 'zustand';

/**
 * PWA 更新提示的 UI 状态。不持久化：
 * 整页刷新后 waiting 的 Service Worker 会自动接管，提示不需要跨会话记住。
 */
interface PwaUpdateState {
  /** 新版本已就绪（Service Worker 处于 waiting）。 */
  needRefresh: boolean;
  /** 用户点过「稍后」：弹窗收起，顶栏徽标保留。 */
  dismissed: boolean;
  /** 确认刷新：由 vite-plugin-pwa 的 updateServiceWorker 注入。 */
  applyUpdate: () => void;
  markNeedRefresh: () => void;
  dismissPrompt: () => void;
  reopenPrompt: () => void;
  setApplyUpdate: (applyUpdate: () => void) => void;
}

export const usePwaUpdate = create<PwaUpdateState>()((set) => ({
  needRefresh: false,
  dismissed: false,
  applyUpdate: () => {},
  // 新版本到来时重新打开弹窗，即使上一次已经点过「稍后」。
  markNeedRefresh: () => set({ needRefresh: true, dismissed: false }),
  dismissPrompt: () => set({ dismissed: true }),
  reopenPrompt: () => set({ dismissed: false }),
  // 注意：zustand 的 set 收到函数会当成 updater，所以必须包在对象里。
  setApplyUpdate: (applyUpdate) => set({ applyUpdate }),
}));
