import { useCallback, useEffect } from 'react';
import { useWalletStore } from '../store/walletSlice';
import { accountService } from '../services/accountService';
import type { ContractSigner } from '../types/signer';

export function useWallet() {
  const { publicKey, isConnected, balance, error, setWallet, setBalance, setError, disconnect } =
    useWalletStore();

  /** Auto-init account on first call */
  const initAccount = useCallback(() => {
    try {
      const pk = accountService.init();
      setWallet(pk);
      return pk;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to init account');
      return null;
    }
  }, [setWallet, setError]);

  /** Fetch balance from Horizon */
  const refreshBalance = useCallback(async () => {
    try {
      const bal = await accountService.getBalance();
      setBalance(bal);
      return bal;
    } catch {
      setBalance(null);
      return null;
    }
  }, [setBalance]);

  /** Fund via friendbot */
  const fundAccount = useCallback(async () => {
    try {
      setError(null);
      await accountService.fund();
      await refreshBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fund');
    }
  }, [refreshBalance, setError]);

  /** Reset account (new keypair) */
  const resetAccount = useCallback(() => {
    const pk = accountService.reset();
    setWallet(pk);
    setBalance(null);
  }, [setWallet, setBalance]);

  /** Get signer for contract calls */
  const getContractSigner = useCallback((): ContractSigner => {
    if (!isConnected) throw new Error('Account not initialized');
    return accountService.getSigner();
  }, [isConnected]);

  return {
    publicKey,
    isConnected,
    balance,
    error,
    initAccount,
    refreshBalance,
    fundAccount,
    resetAccount,
    getContractSigner,
    disconnect,
  };
}
