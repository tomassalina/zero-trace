import { useState, useEffect } from 'react';
import { useWallet } from './hooks/useWallet';
import type { AppScreen } from './games/zero-trace/types';
import { BottomNav } from './components/BottomNav';
import { BalanceBadge } from './components/BalanceBadge';
import { HomeScreen } from './screens/HomeScreen';
import { PlayScreen } from './screens/PlayScreen';
import { ProfileScreen } from './screens/ProfileScreen';

export default function App() {
  const { publicKey, isConnected, balance, error, initAccount, refreshBalance, fundAccount, resetAccount } = useWallet();
  const [screen, setScreen] = useState<AppScreen>('home');
  const [playAction, setPlayAction] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);

  // Auto-init on mount
  useEffect(() => {
    initAccount();
  }, []);

  // Refresh balance on connect
  useEffect(() => {
    if (isConnected) refreshBalance();
  }, [isConnected]);

  const handleNavigate = (s: AppScreen, action?: string) => {
    setScreen(s);
    if (action) setPlayAction(action);
    else setPlayAction(null);
  };

  const handleFund = async () => {
    setFunding(true);
    try {
      await fundAccount();
    } finally {
      setFunding(false);
    }
  };

  return (
    <div className="min-h-dvh w-full flex flex-col items-center bg-slate-950">
      <div className="w-full max-w-[400px] min-h-dvh flex flex-col pb-20">
        {/* Header */}
        <header className="flex items-center justify-between px-4 pt-5 pb-2">
          <h1
            className="text-xl font-black tracking-tighter text-white cursor-pointer"
            onClick={() => handleNavigate('home')}
          >
            ZERO<span className="text-cyan-500">TRACE</span>
          </h1>
          {isConnected && (
            <BalanceBadge balance={balance} onFund={handleFund} loading={funding} />
          )}
        </header>

        {/* Testnet Badge */}
        <div className="px-4 pb-2">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-medium text-emerald-400">Stellar Testnet</span>
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 px-4 pb-6">
          {!isConnected ? (
            <div className="mt-8 p-5 rounded-2xl bg-slate-900/50 border border-slate-800 text-center">
              <p className="text-sm text-slate-400">Loading account...</p>
              <div className="w-5 h-5 mx-auto mt-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {screen === 'home' && <HomeScreen onNavigate={handleNavigate} />}
              {screen === 'play' && <PlayScreen initialAction={playAction} />}
              {screen === 'profile' && (
                <ProfileScreen
                  publicKey={publicKey!}
                  balance={balance}
                  onFund={fundAccount}
                  onReset={resetAccount}
                  onRefreshBalance={refreshBalance}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Bottom Nav */}
      <BottomNav active={screen} onChange={(s) => handleNavigate(s)} />
    </div>
  );
}
