import { create } from 'zustand';

interface RateLimitState {
  limit: number;
  remaining: number;
  resetAt: number;
  set: (info: { limit: number; remaining: number; resetAt: number }) => void;
  reset: () => void;
}

export const useRateLimit = create<RateLimitState>()((set) => ({
  limit: 5000,
  remaining: 5000,
  resetAt: 0,
  set: (info) => set(info),
  reset: () => set({ limit: 5000, remaining: 5000, resetAt: 0 }),
}));
