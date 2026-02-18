import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Toaster } from 'sonner';
import { initWalletKit } from './lib/walletKit';
import { useWallet } from './hooks/useWallet';
import { BottomNav } from './components/BottomNav';
import { WalletButton } from './components/WalletButton';
import { ActiveGameGuard } from './components/ActiveGameGuard';
import { HomeScreen } from './screens/HomeScreen';
import { HowItWorksScreen } from './screens/HowItWorksScreen';
import { PlayMenu } from './screens/play/PlayMenu';
import { CreateRoomForm } from './screens/play/CreateRoomForm';
import { RoomList } from './screens/play/RoomList';
import { GameRoom } from './screens/GameRoom';
import { AccountScreen } from './screens/AccountScreen';
import { TutorialScreen } from './screens/TutorialScreen';

/** Fixed layout heights — used by GameRoom via CSS var */
const HEADER_H = 48;
const NAV_H = 56;

function ConnectGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, connect } = useWallet();
  if (!isConnected) {
    return (
      <div className="mt-8 p-5 rounded-2xl bg-slate-900/50 border border-slate-800 text-center space-y-3">
        <p className="text-sm text-slate-400">Connect your wallet to continue</p>
        <button
          onClick={connect}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Connect Wallet
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  useEffect(() => { initWalletKit(); }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--header-h', `${HEADER_H}px`);
    root.style.setProperty('--nav-h', `${NAV_H}px`);
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-dvh w-full flex flex-col items-center bg-slate-950">
        {/* App shell — side borders visible on tablet/desktop */}
        <div className="w-full max-w-[400px] min-h-dvh flex flex-col border-x border-border/20 shadow-[inset_1px_0_0_oklch(1_0_0/0.03),-1px_0_0_oklch(1_0_0/0.03)]">
          {/* Header */}
          <header
            className="shrink-0 flex items-center justify-between px-4 border-b border-border/30 shadow-[0_1px_8px_oklch(0_0_0/0.4)] z-40 bg-slate-950"
            style={{ height: HEADER_H }}
          >
            <Link to="/" className="text-xl font-black tracking-tighter text-white">
              ZERO<span className="text-cyan-500">TRACE</span>
            </Link>
            <WalletButton />
          </header>

          <div className="flex-1 flex flex-col pb-(--nav-h)">
          {/* Content */}
          <main className="flex-1 px-2">
            <Routes>
              {/* Free pages — no active game check */}
              <Route path="/" element={<HomeScreen />} />
              <Route path="/account" element={<ConnectGuard><AccountScreen /></ConnectGuard>} />
              <Route path="/tutorial" element={<TutorialScreen />} />

              {/* Game room — always accessible */}
              <Route path="/room/:id" element={<ConnectGuard><GameRoom /></ConnectGuard>} />

              {/* Guarded pages — blocked if active game exists */}
              <Route path="/how-it-works" element={<ActiveGameGuard><HowItWorksScreen /></ActiveGameGuard>} />
              <Route path="/play" element={<ConnectGuard><PlayMenu /></ConnectGuard>} />
              <Route path="/play/create" element={<ConnectGuard><ActiveGameGuard><CreateRoomForm /></ActiveGameGuard></ConnectGuard>} />
              <Route path="/play/rooms" element={<ConnectGuard><ActiveGameGuard><RoomList /></ActiveGameGuard></ConnectGuard>} />

              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
          </div>
        </div>

        {/* Bottom nav — fixed height */}
        <BottomNav />
      </div>

      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: 'oklch(0.157 0.044 264.695)',
            border: '1px solid oklch(0.306 0.044 264.695)',
            color: 'oklch(0.985 0.002 247.858)',
            fontSize: '13px',
          },
        }}
      />
    </BrowserRouter>
  );
}
