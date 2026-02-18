import { NavLink, useLocation } from 'react-router-dom';
import { Home, Crosshair, User } from 'lucide-react';

const tabs = [
  { path: '/', label: 'Home', icon: <Home size={20} /> },
  { path: '/play', label: 'Play', icon: <Crosshair size={20} /> },
  { path: '/account', label: 'Account', icon: <User size={20} /> },
];

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[400px] z-50 bg-card/95 border-t border-border/30 backdrop-blur-xl shadow-[0_-1px_8px_oklch(0_0_0/0.3)]"
      style={{ height: 'var(--nav-h, 56px)' }}
    >
      <div className="h-full flex items-center justify-around px-4">
        {tabs.map((tab) => {
          const isActive =
            tab.path === '/'
              ? pathname === '/'
              : tab.path === '/play'
              ? pathname.startsWith('/play') || pathname.startsWith('/room/')
              : pathname.startsWith(tab.path);

          return (
            <NavLink key={tab.path} to={tab.path}>
              <div className={`flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-xl transition-all duration-200 ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}>
                {tab.icon}
                <span className="text-[9px] font-semibold tracking-wide uppercase">{tab.label}</span>
                {isActive && <div className="w-4 h-0.5 rounded-full bg-primary" />}
              </div>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
