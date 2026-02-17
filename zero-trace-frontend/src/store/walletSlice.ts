import { create } from 'zustand';

export interface WalletState {
  publicKey: string | null;
  isConnected: boolean;
  balance: string | null;
  error: string | null;

  setWallet: (publicKey: string) => void;
  setBalance: (balance: string | null) => void;
  setError: (error: string | null) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>()((set) => ({
  publicKey: null,
  isConnected: false,
  balance: null,
  error: null,

  setWallet: (publicKey) =>
    set({ publicKey, isConnected: true, error: null }),

  setBalance: (balance) => set({ balance }),

  setError: (error) => set({ error }),

  disconnect: () =>
    set({ publicKey: null, isConnected: false, balance: null, error: null }),
}));
