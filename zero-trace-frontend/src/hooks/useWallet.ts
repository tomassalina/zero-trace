import { useCallback } from 'react';
import { useWalletStore } from '../store/walletSlice';
import { StellarWalletsKit } from '../lib/walletKit';
import type { ContractSigner } from '../types/signer';
import { NETWORK_PASSPHRASE } from '../utils/constants';

export function useWallet() {
  const { publicKey, isConnected, balance, error, network, setWallet, setBalance, setError, setNetwork, disconnect: storeDisconnect } =
    useWalletStore();

  const connect = useCallback(async () => {
    try {
      setError(null);
      const { address } = await StellarWalletsKit.authModal();
      setWallet(address);
      // Fetch balance after connecting
      try {
        const res = await fetch(
          `https://horizon-testnet.stellar.org/accounts/${address}`
        );
        if (res.ok) {
          const data = await res.json();
          const native = data.balances?.find((b: any) => b.asset_type === 'native');
          setBalance(native?.balance ?? '0');
        } else {
          setBalance('0');
        }
      } catch {
        setBalance('0');
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('cancel')) return;
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [setWallet, setBalance, setError]);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch {
      // ignore disconnect errors
    }
    storeDisconnect();
  }, [storeDisconnect]);

  const refreshBalance = useCallback(async () => {
    if (!publicKey) return null;
    try {
      const res = await fetch(
        `https://horizon-testnet.stellar.org/accounts/${publicKey}`
      );
      if (res.status === 404) { setBalance('0'); return '0'; }
      if (!res.ok) { setBalance(null); return null; }
      const data = await res.json();
      const native = data.balances?.find((b: any) => b.asset_type === 'native');
      const bal = native?.balance ?? '0';
      setBalance(bal);
      return bal;
    } catch {
      setBalance(null);
      return null;
    }
  }, [publicKey, setBalance]);

  const fundAccount = useCallback(async () => {
    if (!publicKey) return;
    try {
      setError(null);
      const res = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
      if (!res.ok) throw new Error(`Friendbot failed (${res.status})`);
      await refreshBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fund');
    }
  }, [publicKey, refreshBalance, setError]);

  const getContractSigner = useCallback((): ContractSigner => {
    if (!isConnected || !publicKey) throw new Error('Wallet not connected');
    return {
      signTransaction: async (txXdr: string, opts?: any) => {
        const result = await StellarWalletsKit.signTransaction(txXdr, {
          networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
          address: publicKey,
        });
        return {
          signedTxXdr: result.signedTxXdr,
          signerAddress: result.signerAddress ?? publicKey,
        };
      },
      signAuthEntry: async (preimageXdr: string, opts?: any) => {
        const result = await StellarWalletsKit.signAuthEntry(preimageXdr, {
          networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
          address: publicKey,
        });
        return {
          signedAuthEntry: result.signedAuthEntry,
          signerAddress: result.signerAddress ?? publicKey,
        };
      },
    };
  }, [isConnected, publicKey]);

  return {
    publicKey,
    isConnected,
    balance,
    error,
    network,
    connect,
    disconnect,
    refreshBalance,
    fundAccount,
    getContractSigner,
  };
}
