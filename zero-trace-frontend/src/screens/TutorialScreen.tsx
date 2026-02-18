import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Trophy, Skull, X, Clock, Hash, Swords, Loader2, Handshake, Timer, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { GameBoard } from '../games/zero-trace/GameBoard';
import type { Position } from '../games/zero-trace/types';

const GAME_H = 'calc(100dvh - var(--header-h, 48px) - var(--nav-h, 56px))';

const MOCK_GAME_ID = '12345';
const mockMyPosition: Position = { x: 2, y: 3 };
const mockBlockedCells: Position[] = [
  { x: 0, y: 5 },
  { x: 4, y: 2 },
];
const mockShotHistory = [
  { pos: { x: 0, y: 5 }, hit: true },
  { pos: { x: 3, y: 1 }, hit: false },
  { pos: { x: 4, y: 2 }, hit: true },
];
const mockIncomingShot: Position = { x: 1, y: 4 };

type MockPhase = 'setup' | 'firing' | 'moving' | 'waiting' | 'finished-win' | 'finished-lose' | 'finished-draw' | 'finished-timeout';

const PHASES: MockPhase[] = ['setup', 'firing', 'moving', 'waiting', 'finished-win', 'finished-lose', 'finished-draw', 'finished-timeout'];

function SideIndicator({ icon, label, onClick, className = '' }: {
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-1.5 py-2 rounded-xl border ${className} ${onClick ? 'active:scale-95 transition-transform' : ''}`}
    >
      {icon}
      {label}
    </Tag>
  );
}

export function TutorialScreen() {
  const [phase, setPhase] = useState<MockPhase>('firing');
  const [selectedCell, setSelectedCell] = useState<Position | null>(null);
  const [loading, setLoading] = useState(false);

  const fakeLoad = useCallback(() => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1000);
  }, []);

  const copyGameId = useCallback(() => {
    navigator.clipboard.writeText(MOCK_GAME_ID);
    toast.success('Game ID copied!');
  }, []);

  // King-style movement: all 8 adjacent cells around mockMyPosition (2,3)
  // Filter out blocked/hit cells — B5 (1,4) was hit by incoming shot
  const moveTargets: Position[] = phase === 'moving'
    ? [
        { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 },
        { x: 1, y: 3 },                 { x: 3, y: 3 },
                         { x: 2, y: 4 }, { x: 3, y: 4 },
      ]
    : [];

  let boardMode: 'select-position' | 'fire' | 'move' | 'view' = 'view';
  let disabledHalf: 'enemy' | 'ally' | 'both' | null = null;

  if (phase === 'setup') {
    boardMode = 'move';
    disabledHalf = 'enemy';
  } else if (phase === 'firing') {
    boardMode = 'fire';
    disabledHalf = 'ally';
  } else if (phase === 'moving') {
    boardMode = 'move';
    disabledHalf = 'enemy';
  } else if (phase === 'waiting') {
    boardMode = 'view';
    disabledHalf = 'both';
  }

  const isFinished = phase.startsWith('finished');
  if (isFinished) {
    boardMode = 'view';
  }

  const showAction = phase === 'setup' || phase === 'firing' || phase === 'moving' || phase === 'waiting';

  const phaseLabel = phase === 'firing' ? 'FIRE' : phase === 'moving' ? 'MOVE' : phase === 'waiting' ? 'WAIT' : phase === 'setup' ? 'SETUP' : '';
  const phaseColor = phase === 'firing'
    ? 'text-red-400 border-red-500/30 bg-red-500/10'
    : phase === 'waiting'
    ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    : 'text-primary border-primary/30 bg-primary/10';

  return (
    <div className="relative flex flex-col overflow-hidden" style={{ height: GAME_H }}>

      {/* Phase selector (tutorial only) */}
      <div className="shrink-0 flex items-center gap-1 py-1.5 overflow-x-auto">
        {PHASES.map((p) => (
          <button
            key={p}
            onClick={() => { setPhase(p); setSelectedCell(null); setLoading(false); }}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
              phase === p
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Game board with side indicators */}
      <div className="flex-1 min-h-0 flex">
        {/* Left side indicators */}
        <div className="shrink-0 flex flex-col items-center justify-center gap-2 pr-1.5">
          {/* Game ID — tap to copy */}
          <SideIndicator
            icon={<Hash size={12} className="text-muted-foreground" />}
            label={<span className="text-[8px] font-mono font-bold text-muted-foreground">123...</span>}
            onClick={copyGameId}
            className="border-border/30 bg-card/50"
          />
          {/* Round */}
          {!isFinished && (
            <SideIndicator
              icon={<Swords size={12} className="text-muted-foreground" />}
              label={<span className="text-[9px] font-mono font-bold text-foreground">{phase === 'setup' ? 'R0' : 'R3'}</span>}
              className="border-border/30 bg-card/50"
            />
          )}
        </div>

        {/* Board center */}
        <div className="flex-1 min-w-0 h-full">
          <GameBoard
            myPosition={phase === 'setup' ? selectedCell : mockMyPosition}
            blockedCells={phase === 'setup' ? [] : mockBlockedCells}
            onCellClick={(x, y) => {
              if (isFinished || phase === 'waiting') return;
              if (phase === 'moving') {
                if (moveTargets.some((t) => t.x === x && t.y === y)) {
                  setSelectedCell({ x, y });
                }
              } else {
                setSelectedCell({ x, y });
              }
            }}
            selectedCell={isFinished || phase === 'waiting' ? null : selectedCell}
            mode={boardMode}
            shotHistory={phase === 'setup' ? [] : mockShotHistory}
            moveTargets={moveTargets}
            compact
            disabledHalf={isFinished ? null : disabledHalf}
            incomingShot={phase !== 'setup' ? mockIncomingShot : undefined}
            incomingShotHit={phase !== 'setup' ? true : undefined}
          />
        </div>

        {/* Right side indicators */}
        <div className="shrink-0 flex flex-col items-center justify-center gap-2 pl-1.5">
          {/* Timer */}
          {!isFinished && (
            <SideIndicator
              icon={<Clock size={12} className="text-emerald-400" />}
              label={<span className="text-[9px] font-mono font-bold text-emerald-400">2:45</span>}
              className="border-emerald-500/30 bg-emerald-500/5"
            />
          )}
          {/* Phase */}
          {!isFinished && phaseLabel && (
            <SideIndicator
              icon={<Zap size={12} className="currentColor" />}
              label={<span className="text-[8px] font-black tracking-wider">{phaseLabel}</span>}
              className={phaseColor}
            />
          )}
        </div>
      </div>

      {/* Action bar — always at bottom for all interactive + waiting states */}
      {showAction && (
        <div className="shrink-0 py-1.5">
          <div className="rounded-2xl bg-card/95 border border-primary/20 p-1.5">
            {phase === 'setup' && (
              <Button
                className="w-full h-11 text-sm font-bold"
                disabled={!selectedCell || loading}
                onClick={fakeLoad}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Commit Position'}
              </Button>
            )}
            {phase === 'firing' && (
              <Button
                variant="destructive"
                className="w-full h-11 text-sm font-bold"
                disabled={!selectedCell || loading}
                onClick={fakeLoad}
              >
                {loading
                  ? <Loader2 size={16} className="animate-spin" />
                  : selectedCell
                    ? `Fire at ${String.fromCharCode(65 + selectedCell.x)}${selectedCell.y + 1}`
                    : 'Select target to fire'}
              </Button>
            )}
            {phase === 'moving' && (
              <Button
                className="w-full h-11 text-sm font-bold"
                disabled={!selectedCell || loading}
                onClick={fakeLoad}
              >
                {loading
                  ? <Loader2 size={16} className="animate-spin" />
                  : selectedCell
                    ? `Move to ${String.fromCharCode(65 + selectedCell.x)}${selectedCell.y + 1}`
                    : 'Select a cell to move'}
              </Button>
            )}
            {phase === 'waiting' && (
              <Button
                variant="secondary"
                className="w-full h-11 text-sm font-bold"
                disabled
              >
                <Loader2 size={16} className="animate-spin mr-2" />
                Waiting for opponent...
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Finished modal overlay */}
      {isFinished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="relative w-[85%] max-w-[320px] rounded-3xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
            {/* Glow accent */}
            <div className={`absolute inset-x-0 top-0 h-1 ${
              phase === 'finished-win'
                ? 'bg-linear-to-r from-transparent via-primary to-transparent'
                : phase === 'finished-draw'
                ? 'bg-linear-to-r from-transparent via-white to-transparent'
                : phase === 'finished-timeout'
                ? 'bg-linear-to-r from-transparent via-amber-400 to-transparent'
                : 'bg-linear-to-r from-transparent via-destructive to-transparent'
            }`} />

            <button
              onClick={() => setPhase('firing')}
              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>

            <div className="px-6 pt-8 pb-6 flex flex-col items-center gap-4">

              {/* WIN */}
              {phase === 'finished-win' && (
                <>
                  <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Trophy size={32} className="text-primary" />
                  </div>
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-black text-primary tracking-tight">VICTORY!</h2>
                    <p className="text-xs text-muted-foreground">You destroyed the enemy submarine</p>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/5 border border-primary/10">
                    <span className="text-sm font-bold text-primary">+90 XLM</span>
                    <span className="text-[10px] text-muted-foreground">winnings</span>
                  </div>
                </>
              )}

              {/* LOSE */}
              {phase === 'finished-lose' && (
                <>
                  <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                    <Skull size={32} className="text-destructive" />
                  </div>
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-black text-destructive tracking-tight">DEFEATED</h2>
                    <p className="text-xs text-muted-foreground">Your submarine was destroyed</p>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/5 border border-destructive/10">
                    <span className="text-sm font-bold text-destructive">-50 XLM</span>
                    <span className="text-[10px] text-muted-foreground">entry fee lost</span>
                  </div>
                </>
              )}

              {/* DRAW */}
              {phase === 'finished-draw' && (
                <>
                  <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                    <Handshake size={32} className="text-white" />
                  </div>
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-black text-white tracking-tight">DRAW</h2>
                    <p className="text-xs text-muted-foreground">Both submarines destroyed simultaneously</p>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-sm font-bold text-white">+50 XLM</span>
                    <span className="text-[10px] text-muted-foreground">refunded</span>
                  </div>
                </>
              )}

              {/* TIMEOUT */}
              {phase === 'finished-timeout' && (
                <>
                  <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <Timer size={32} className="text-amber-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-black text-amber-400 tracking-tight">TIMED OUT</h2>
                    <p className="text-xs text-muted-foreground">You ran out of time to respond</p>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/5 border border-amber-500/10">
                    <span className="text-sm font-bold text-amber-400">-50 XLM</span>
                    <span className="text-[10px] text-muted-foreground">forfeited</span>
                  </div>
                </>
              )}

              <div className="w-full grid grid-cols-2 gap-2 pt-2">
                <Button variant="outline" className="h-12 font-bold rounded-xl">
                  Exit
                </Button>
                <Button className="h-12 font-bold rounded-xl">
                  Rematch
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
