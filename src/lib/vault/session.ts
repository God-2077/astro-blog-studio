let token: string | null = null;

export const vaultSession = {
  set(value: string): void {
    token = value;
  },
  get(): string | null {
    return token;
  },
  clear(): void {
    token = null;
  },
  has(): boolean {
    return token !== null;
  },
};
