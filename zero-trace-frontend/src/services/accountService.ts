import { Buffer } from 'buffer';
import { Keypair, TransactionBuilder, hash } from '@stellar/stellar-sdk';
import type { ContractSigner } from '../types/signer';
import type { WalletError } from '@stellar/stellar-sdk/contract';

const STORAGE_KEY = 'zt-account-v1';

interface StoredAccount {
  secret: string;
  publicKey: string;
}

class AccountService {
  private keypair: Keypair | null = null;

  /** Sync init — reads or creates keypair from localStorage */
  init(): string {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed: StoredAccount = JSON.parse(stored);
        this.keypair = Keypair.fromSecret(parsed.secret);
        return this.keypair.publicKey();
      } catch {
        // Corrupted — regenerate
      }
    }
    return this.createNew();
  }

  private createNew(): string {
    this.keypair = Keypair.random();
    const data: StoredAccount = {
      secret: this.keypair.secret(),
      publicKey: this.keypair.publicKey(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return this.keypair.publicKey();
  }

  getPublicKey(): string {
    if (!this.keypair) throw new Error('Account not initialized');
    return this.keypair.publicKey();
  }

  isInitialized(): boolean {
    return this.keypair !== null;
  }

  async getBalance(): Promise<string> {
    if (!this.keypair) throw new Error('Account not initialized');
    try {
      const res = await fetch(
        `https://horizon-testnet.stellar.org/accounts/${this.keypair.publicKey()}`
      );
      if (res.status === 404) return '0';
      if (!res.ok) throw new Error(`Horizon error ${res.status}`);
      const data = await res.json();
      const native = data.balances?.find((b: any) => b.asset_type === 'native');
      return native?.balance ?? '0';
    } catch {
      return '0';
    }
  }

  async fund(): Promise<void> {
    if (!this.keypair) throw new Error('Account not initialized');
    const res = await fetch(
      `https://friendbot.stellar.org?addr=${this.keypair.publicKey()}`
    );
    if (!res.ok) {
      throw new Error(`Friendbot failed (${res.status})`);
    }
  }

  getSigner(): ContractSigner {
    if (!this.keypair) throw new Error('Account not initialized');
    const keypair = this.keypair;
    const publicKey = keypair.publicKey();
    const toWalletError = (message: string): WalletError => ({ message, code: -1 });

    return {
      signTransaction: async (txXdr: string, opts?: any) => {
        try {
          if (!opts?.networkPassphrase) throw new Error('Missing networkPassphrase');
          const transaction = TransactionBuilder.fromXDR(txXdr, opts.networkPassphrase);
          transaction.sign(keypair);
          return { signedTxXdr: transaction.toXDR(), signerAddress: publicKey };
        } catch (error) {
          return {
            signedTxXdr: txXdr,
            signerAddress: publicKey,
            error: toWalletError(error instanceof Error ? error.message : 'Failed to sign'),
          };
        }
      },
      signAuthEntry: async (preimageXdr: string) => {
        try {
          const preimageBytes = Buffer.from(preimageXdr, 'base64');
          const payload = hash(preimageBytes);
          const signatureBytes = keypair.sign(payload);
          return {
            signedAuthEntry: Buffer.from(signatureBytes).toString('base64'),
            signerAddress: publicKey,
          };
        } catch (error) {
          return {
            signedAuthEntry: preimageXdr,
            signerAddress: publicKey,
            error: toWalletError(error instanceof Error ? error.message : 'Failed to sign'),
          };
        }
      },
    };
  }

  /** Reset account — generates new keypair */
  reset(): string {
    this.keypair = null;
    localStorage.removeItem(STORAGE_KEY);
    return this.createNew();
  }
}

export const accountService = new AccountService();
