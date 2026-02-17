import type { ReactNode } from 'react';
import { Home, Crosshair, User } from 'lucide-react';
import type { AppScreen } from '../games/zero-trace/types';

interface Props {
  active: AppScreen;
  onChange: (screen: AppScreen) => void;
}

const tabs: { id: AppScreen; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <Home size={20} /> },
  { id: 'play', label: 'Play', icon: <Crosshair size={20} /> },
  { id: 'profile', label: 'Account', icon: <User size={20} /> },
];

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[400px] z-50">
      <div className="mx-2 mb-2 rounded-2xl bg-card/95 border border-border backdrop-blur-xl">
        <div className="flex items-center justify-around py-1">
          {tabs.map((tab) => {
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={`flex flex-col items-center gap-0.5 px-6 py-2 rounded-xl transition-all duration-200 ${
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.icon}
                <span className="text-[9px] font-semibold tracking-wide uppercase">{tab.label}</span>
                {isActive && <div className="w-4 h-0.5 rounded-full bg-primary mt-0.5" />}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
