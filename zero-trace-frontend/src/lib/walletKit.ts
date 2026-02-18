import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit/sdk';
import { FreighterModule } from '@creit-tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit-tech/stellar-wallets-kit/modules/xbull';
import { LobstrModule } from '@creit-tech/stellar-wallets-kit/modules/lobstr';
import { AlbedoModule } from '@creit-tech/stellar-wallets-kit/modules/albedo';
import { HanaModule } from '@creit-tech/stellar-wallets-kit/modules/hana';
import { Networks } from '@creit-tech/stellar-wallets-kit/types';

export function initWalletKit() {
  StellarWalletsKit.init({
    modules: [
      new FreighterModule(),
      new xBullModule(),
      new LobstrModule(),
      new AlbedoModule(),
      new HanaModule(),
    ],
    network: Networks.TESTNET,
  });
}

export { StellarWalletsKit, Networks };
