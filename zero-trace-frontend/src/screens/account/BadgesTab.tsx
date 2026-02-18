import { useMemo } from 'react';
import { getStats, type PlayerStats } from '@/services/historyService';
import {
  Sword, Target, Medal, ShieldCheck, Star, Crown,
  Flame, Zap, Diamond, Infinity, Bird, Sparkles,
} from 'lucide-react';

interface BadgeDef {
  id: string;
  name: string;
  requirement: string;
  icon: React.ReactNode;
  check: (stats: PlayerStats) => boolean;
  progress: (stats: PlayerStats) => { current: number; target: number };
}

const badges: BadgeDef[] = [
  {
    id: 'first-blood', name: 'First Blood', requirement: '1 win',
    icon: <Sword size={22} />,
    check: (s) => s.totalWins >= 1,
    progress: (s) => ({ current: Math.min(s.totalWins, 1), target: 1 }),
  },
  {
    id: 'sharpshooter', name: 'Sharpshooter', requirement: '5 wins',
    icon: <Target size={22} />,
    check: (s) => s.totalWins >= 5,
    progress: (s) => ({ current: Math.min(s.totalWins, 5), target: 5 }),
  },
  {
    id: 'veteran', name: 'Veteran', requirement: '10 wins',
    icon: <Medal size={22} />,
    check: (s) => s.totalWins >= 10,
    progress: (s) => ({ current: Math.min(s.totalWins, 10), target: 10 }),
  },
  {
    id: 'commander', name: 'Commander', requirement: '25 wins',
    icon: <ShieldCheck size={22} />,
    check: (s) => s.totalWins >= 25,
    progress: (s) => ({ current: Math.min(s.totalWins, 25), target: 25 }),
  },
  {
    id: 'admiral', name: 'Admiral', requirement: '50 wins',
    icon: <Star size={22} />,
    check: (s) => s.totalWins >= 50,
    progress: (s) => ({ current: Math.min(s.totalWins, 50), target: 50 }),
  },
  {
    id: 'legend', name: 'Legend', requirement: '100 wins',
    icon: <Crown size={22} />,
    check: (s) => s.totalWins >= 100,
    progress: (s) => ({ current: Math.min(s.totalWins, 100), target: 100 }),
  },
  {
    id: 'on-fire', name: 'On Fire', requirement: '3-win streak',
    icon: <Flame size={22} />,
    check: (s) => s.bestStreak >= 3,
    progress: (s) => ({ current: Math.min(s.bestStreak, 3), target: 3 }),
  },
  {
    id: 'unstoppable', name: 'Unstoppable', requirement: '5-win streak',
    icon: <Zap size={22} />,
    check: (s) => s.bestStreak >= 5,
    progress: (s) => ({ current: Math.min(s.bestStreak, 5), target: 5 }),
  },
  {
    id: 'dominator', name: 'Dominator', requirement: '10-win streak',
    icon: <Diamond size={22} />,
    check: (s) => s.bestStreak >= 10,
    progress: (s) => ({ current: Math.min(s.bestStreak, 10), target: 10 }),
  },
  {
    id: 'invincible', name: 'Invincible', requirement: '25-win streak',
    icon: <Infinity size={22} />,
    check: (s) => s.bestStreak >= 25,
    progress: (s) => ({ current: Math.min(s.bestStreak, 25), target: 25 }),
  },
  {
    id: 'untouchable', name: 'Untouchable', requirement: '50-win streak',
    icon: <Bird size={22} />,
    check: (s) => s.bestStreak >= 50,
    progress: (s) => ({ current: Math.min(s.bestStreak, 50), target: 50 }),
  },
  {
    id: 'immortal', name: 'Immortal', requirement: '100-win streak',
    icon: <Sparkles size={22} />,
    check: (s) => s.bestStreak >= 100,
    progress: (s) => ({ current: Math.min(s.bestStreak, 100), target: 100 }),
  },
];

interface Props {
  address: string;
}

export function BadgesTab({ address }: Props) {
  const stats = useMemo(() => getStats(address), [address]);
  const unlockedCount = badges.filter((b) => b.check(stats)).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {unlockedCount}/{badges.length} unlocked
        </p>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{stats.totalWins}W</span>
          <span>{stats.totalLosses}L</span>
          <span>{stats.totalDraws}D</span>
          <span>Best: {stats.bestStreak}</span>
        </div>
      </div>

      {/* Badge Grid */}
      <div className="grid grid-cols-3 gap-2">
        {badges.map((badge) => {
          const unlocked = badge.check(stats);
          const { current, target } = badge.progress(stats);
          const pct = Math.min((current / target) * 100, 100);

          return (
            <div
              key={badge.id}
              className={`relative rounded-xl border p-3 text-center space-y-1.5 transition-all ${
                unlocked
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border/20 bg-card/20 opacity-40'
              }`}
            >
              {/* Icon */}
              <div
                className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center ${
                  unlocked
                    ? 'bg-primary/20 text-primary drop-shadow-[0_0_8px_oklch(0.715_0.143_215.221/0.4)]'
                    : 'bg-muted/30 text-muted-foreground'
                }`}
              >
                {badge.icon}
              </div>

              {/* Name */}
              <p className={`text-[10px] font-bold leading-tight ${
                unlocked ? 'text-foreground' : 'text-muted-foreground'
              }`}>
                {badge.name}
              </p>

              {/* Progress or requirement */}
              {unlocked ? (
                <p className="text-[8px] text-primary font-medium">{badge.requirement}</p>
              ) : (
                <div className="space-y-0.5">
                  <div className="h-0.5 w-full bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/50 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[8px] text-muted-foreground">{current}/{target}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
