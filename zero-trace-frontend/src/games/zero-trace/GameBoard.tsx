import { useState, useEffect, useRef, useCallback } from 'react';
import { type Position, GRID_SIZE } from './types';

interface ShotEntry {
  pos: Position;
  hit: boolean;
}

interface GameBoardProps {
  myPosition?: Position | null;
  blockedCells: Position[];
  lastShot?: Position | null;
  lastShotHit?: boolean | null;
  moveTargets?: Position[];
  onCellClick?: (x: number, y: number) => void;
  selectedCell?: Position | null;
  mode: 'select-position' | 'fire' | 'move' | 'view';
  shotHistory?: ShotEntry[];
  combined?: boolean;
  /** Incoming shot from opponent (shown on ally grid) */
  incomingShot?: Position | null;
  incomingShotHit?: boolean | null;
  /** Trigger dual missile animation */
  showMissileAnimation?: boolean;
  /** Whether to use compact mode (fit viewport) */
  compact?: boolean;
  /** Which half to dim/disable: 'enemy' dims top, 'ally' dims bottom, 'both' dims both */
  disabledHalf?: 'enemy' | 'ally' | 'both' | null;
  /** Overlay content to show on the disabled half */
  disabledOverlay?: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Dual missile animation                                             */
/* ------------------------------------------------------------------ */

function useDualMissiles(show: boolean | undefined) {
  const [phase, setPhase] = useState<'idle' | 'missiles' | 'impact' | 'result'>('idle');
  const prevShow = useRef(false);

  useEffect(() => {
    if (show && !prevShow.current) {
      prevShow.current = true;
      setPhase('missiles');
      const t1 = setTimeout(() => setPhase('impact'), 500);
      const t2 = setTimeout(() => setPhase('result'), 1000);
      const t3 = setTimeout(() => {
        setPhase('idle');
        prevShow.current = false;
      }, 2000);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    if (!show) prevShow.current = false;
  }, [show]);

  return phase;
}

/* ------------------------------------------------------------------ */
/*  Single-shot animation (for fire mode)                              */
/* ------------------------------------------------------------------ */

function useAnimatedCells(lastShot: Position | null | undefined, lastShotHit: boolean | null | undefined) {
  const [missileCell, setMissileCell] = useState<Position | null>(null);
  const [impactCell, setImpactCell] = useState<Position | null>(null);
  const prevShot = useRef<string | null>(null);

  useEffect(() => {
    const key = lastShot ? `${lastShot.x},${lastShot.y}` : null;
    if (key && key !== prevShot.current) {
      prevShot.current = key;
      setMissileCell(lastShot!);
      const t1 = setTimeout(() => {
        setMissileCell(null);
        setImpactCell(lastShot!);
      }, 500);
      const t2 = setTimeout(() => setImpactCell(null), 1100);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [lastShot, lastShotHit]);

  return { missileCell, impactCell };
}

/* ------------------------------------------------------------------ */
/*  Coordinate labels                                                  */
/* ------------------------------------------------------------------ */

const cols = Array.from({ length: GRID_SIZE }, (_, i) => i);
const rowsTopDown = Array.from({ length: GRID_SIZE }, (_, i) => GRID_SIZE - 1 - i);

function ColLabels({ variant, compact }: { variant: 'enemy' | 'ally'; compact?: boolean }) {
  return (
    <div className="flex mb-0.5">
      {/* Spacer matching row-label column */}
      <div className={`shrink-0 ${compact ? 'w-3' : 'w-3.5'}`} style={{ marginRight: '2px' }} />
      {/* Labels grid — same structure as the game grid (flex-1 + p-1 + gap) */}
      <div className="flex-1 grid grid-cols-6 gap-[2px] px-1">
        {cols.map((c) => (
          <div
            key={c}
            className={`text-center font-mono font-bold tracking-wider ${
              compact ? 'text-[7px]' : 'text-[8px]'
            } ${variant === 'enemy' ? 'text-red-400/60' : 'text-primary/60'}`}
          >
            {String.fromCharCode(65 + c)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Grid cell renderer                                                 */
/* ------------------------------------------------------------------ */

interface GridProps {
  variant: 'enemy' | 'ally' | 'neutral';
  myPosition?: Position | null;
  blockedCells: Position[];
  lastShot?: Position | null;
  lastShotHit?: boolean | null;
  moveTargets: Position[];
  selectedCell?: Position | null;
  onCellClick?: (x: number, y: number) => void;
  interactive: boolean;
  shotHistory: ShotEntry[];
  missileCell: Position | null;
  impactCell: Position | null;
  incomingShot?: Position | null;
  incomingShotHit?: boolean | null;
  compact?: boolean;
  animPhase?: 'idle' | 'missiles' | 'impact' | 'result';
}

function Grid({
  variant,
  myPosition,
  blockedCells,
  lastShot,
  lastShotHit,
  moveTargets,
  selectedCell,
  onCellClick,
  interactive,
  shotHistory,
  missileCell,
  impactCell,
  incomingShot,
  incomingShotHit,
  compact,
  animPhase = 'idle',
}: GridProps) {
  const isEnemy = variant === 'enemy';
  const isAlly = variant === 'ally';

  function cellClasses(x: number, y: number): string {
    const isSelected = selectedCell?.x === x && selectedCell?.y === y;
    const isMyPos = myPosition?.x === x && myPosition?.y === y;
    const isBlocked = blockedCells.some((c) => c.x === x && c.y === y);
    const isMoveTarget = moveTargets.some((c) => c.x === x && c.y === y);
    const shot = shotHistory.find((s) => s.pos.x === x && s.pos.y === y);
    const isMissile = missileCell?.x === x && missileCell?.y === y;
    const isImpact = impactCell?.x === x && impactCell?.y === y;
    const isIncoming = incomingShot?.x === x && incomingShot?.y === y;

    // Animated missile targeting
    const isAnimTarget = animPhase === 'missiles' && (
      (isEnemy && shot?.pos.x === x && shot?.pos.y === y) ||
      (isAlly && isIncoming)
    );
    const isAnimImpact = animPhase === 'impact' && (
      (isEnemy && shot?.pos.x === x && shot?.pos.y === y) ||
      (isAlly && isIncoming)
    );

    const base = `relative aspect-square rounded-md border transition-all duration-200 flex items-center justify-center ${
      compact ? 'text-[8px]' : ''
    }`;

    if (isAnimTarget) return `${base} border-primary/70 bg-primary/30 animate-pulse`;
    if (isAnimImpact) {
      const wasHit = isEnemy ? (shot?.hit ?? false) : (incomingShotHit ?? false);
      return wasHit
        ? `${base} border-red-500/80 bg-red-500/30 animate-hit-shake`
        : `${base} border-muted-foreground/40 bg-muted/40`;
    }

    if (isMissile) return `${base} border-primary/70 bg-primary/30`;
    if (isImpact && lastShotHit) return `${base} border-red-500/80 bg-red-500/30 animate-hit-shake`;
    if (isImpact && lastShotHit === false) return `${base} border-muted-foreground/40 bg-muted/40`;

    if (isSelected) {
      return `${base} border-primary bg-primary/30 ring-1 ring-primary/50 scale-[1.05]`;
    }
    if (isMyPos) {
      return `${base} border-primary/60 bg-primary/20 shadow-[inset_0_1px_4px_oklch(0.715_0.143_215.221/0.3)]`;
    }

    // Incoming shot result (shown after resolve)
    if (isIncoming && incomingShotHit === true && animPhase === 'idle') {
      return `${base} border-red-500/50 bg-red-500/15`;
    }
    if (isIncoming && incomingShotHit === false && animPhase === 'idle') {
      return `${base} border-blue-400/40 bg-blue-400/10`;
    }

    if (shot?.hit) {
      return `${base} border-red-500/50 bg-red-500/15`;
    }
    // Misses on enemy grid look like normal cells (no special styling)
    // Misses on ally/neutral grid show subtle marker
    if (shot && !shot.hit && !isEnemy) {
      return `${base} border-muted-foreground/25 bg-muted/20`;
    }
    if (isBlocked) {
      // On ally grid: blocked cells are where we got hit — show as damage
      if (isAlly) {
        return `${base} border-red-500/40 bg-red-500/10`;
      }
      // On enemy grid: blocked cells already appear via shotHistory, skip extra styling
      if (isEnemy) {
        return `${base} border-border/30 bg-card/50`;
      }
      return `${base} border-muted-foreground/30 bg-muted/40 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,oklch(0.3_0.01_264/0.25)_3px,oklch(0.3_0.01_264/0.25)_4px)]`;
    }
    if (isMoveTarget) {
      return `${base} border-primary/40 bg-primary/10 grid-cell-interactive`;
    }
    if (interactive) {
      // Only hit cells are blocked in fire mode
      if (shot?.hit) {
        return `${base} border-red-500/50 bg-red-500/15 cursor-not-allowed`;
      }
      return `${base} ${
        isEnemy
          ? 'border-red-500/20 bg-red-950/40 grid-cell-interactive hover:border-red-400/50 hover:bg-red-500/20'
          : 'border-primary/20 bg-primary/[0.06] grid-cell-interactive hover:border-primary/50 hover:bg-primary/15'
      }`;
    }
    // In move mode on ally grid, non-target cells are slightly dimmer
    if (moveTargets.length > 0 && !isMyPos) {
      return `${base} border-border/20 bg-card/30 opacity-60`;
    }
    return `${base} border-border/30 bg-card/50`;
  }

  function cellContent(x: number, y: number) {
    const isMyPos = myPosition?.x === x && myPosition?.y === y;
    const shot = shotHistory.find((s) => s.pos.x === x && s.pos.y === y);
    const isMissile = missileCell?.x === x && missileCell?.y === y;
    const isImpact = impactCell?.x === x && impactCell?.y === y;
    const isMoveTarget = moveTargets.some((c) => c.x === x && c.y === y);
    const isIncoming = incomingShot?.x === x && incomingShot?.y === y;

    // Dual missile animation
    const isAnimMissile = animPhase === 'missiles' && (
      (isEnemy && shot?.pos.x === x) || (isAlly && isIncoming)
    );
    const isAnimImpact = animPhase === 'impact' && (
      (isEnemy && shot?.pos.x === x) || (isAlly && isIncoming)
    );

    if (isAnimMissile) {
      return (
        <div className={isEnemy ? 'animate-missile' : 'animate-missile rotate-180'}>
          <svg width="14" height="14" viewBox="0 0 16 16" className={isEnemy ? 'text-red-400' : 'text-primary'}>
            <path d="M8 1L10 6H6L8 1Z" fill="currentColor" />
            <rect x="7" y="6" width="2" height="7" fill="currentColor" rx="1" />
            <path d="M6 11L8 14L10 11" fill="currentColor" opacity="0.6" />
          </svg>
        </div>
      );
    }

    if (isAnimImpact) {
      const wasHit = isEnemy ? (shot?.hit ?? false) : (incomingShotHit ?? false);
      if (wasHit) {
        return (
          <div className="animate-explosion">
            <svg width="18" height="18" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="4" fill="oklch(0.577 0.245 27.325)" opacity="0.8" />
              <circle cx="10" cy="10" r="7" fill="oklch(0.828 0.189 84.429)" opacity="0.4" />
              <circle cx="10" cy="10" r="2" fill="oklch(0.985 0.002 247.858)" opacity="0.9" />
            </svg>
          </div>
        );
      }
      return <span className="text-muted-foreground/60 text-[9px] font-black animate-fade-in">MISS</span>;
    }

    if (isMissile) {
      return (
        <div className="animate-missile">
          <svg width="14" height="14" viewBox="0 0 16 16" className="text-primary">
            <path d="M8 1L10 6H6L8 1Z" fill="currentColor" />
            <rect x="7" y="6" width="2" height="7" fill="currentColor" rx="1" />
            <path d="M6 11L8 14L10 11" fill="currentColor" opacity="0.6" />
          </svg>
        </div>
      );
    }

    if (isImpact && lastShotHit) {
      return (
        <div className="animate-explosion">
          <svg width="18" height="18" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="4" fill="oklch(0.577 0.245 27.325)" opacity="0.8" />
            <circle cx="10" cy="10" r="7" fill="oklch(0.828 0.189 84.429)" opacity="0.4" />
            <circle cx="10" cy="10" r="2" fill="oklch(0.985 0.002 247.858)" opacity="0.9" />
          </svg>
        </div>
      );
    }
    if (isImpact && lastShotHit === false) {
      return <span className="text-muted-foreground/60 text-[9px] font-black animate-fade-in">MISS</span>;
    }

    if (isMyPos) {
      return (
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
          <svg width="14" height="14" viewBox="0 0 14 14" className="text-primary relative z-10 drop-shadow-[0_0_6px_oklch(0.715_0.143_215.221/0.6)]">
            <circle cx="7" cy="7" r="5" fill="currentColor" opacity="0.3" />
            <circle cx="7" cy="7" r="3" fill="currentColor" />
          </svg>
        </div>
      );
    }

    // Incoming shot marker on ally grid
    if (isIncoming && animPhase === 'idle') {
      if (incomingShotHit === true) {
        return (
          <svg width="12" height="12" viewBox="0 0 14 14" className="text-red-400">
            <circle cx="7" cy="7" r="5" fill="currentColor" opacity="0.3" />
            <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      }
      if (incomingShotHit === false) {
        return (
          <svg width="10" height="10" viewBox="0 0 10 10" className="text-blue-400/60">
            <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1" />
            <circle cx="5" cy="5" r="1.5" fill="currentColor" />
          </svg>
        );
      }
    }

    if (shot?.hit) {
      return (
        <svg width="12" height="12" viewBox="0 0 14 14" className="text-red-400">
          <circle cx="7" cy="7" r="5" fill="currentColor" opacity="0.3" />
          <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    }
    if (shot && !shot.hit && !isEnemy) {
      return (
        <svg width="8" height="8" viewBox="0 0 8 8" className="text-muted-foreground/40">
          <circle cx="4" cy="4" r="3" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="4" cy="4" r="1" fill="currentColor" />
        </svg>
      );
    }

    // Blocked cells on ally grid show damage X
    const isBlocked = blockedCells.some((c) => c.x === x && c.y === y);
    if (isBlocked && isAlly) {
      return (
        <svg width="12" height="12" viewBox="0 0 14 14" className="text-red-400">
          <circle cx="7" cy="7" r="5" fill="currentColor" opacity="0.3" />
          <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    }

    if (isMoveTarget) {
      return <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" />;
    }

    return null;
  }

  return (
    <div className="flex h-full">
      {/* Row labels — outside the grid, vertically aligned */}
      <div className="flex flex-col shrink-0 pr-[2px]" style={{ paddingTop: '4px', paddingBottom: '4px' }}>
        {rowsTopDown.map((row) => (
          <div
            key={row}
            className={`flex-1 flex items-center justify-center font-mono font-bold ${
              compact ? 'text-[6px] w-3' : 'text-[7px] w-3.5'
            } ${isEnemy ? 'text-red-400/50' : isAlly ? 'text-primary/50' : 'text-muted-foreground/50'}`}
          >
            {row + 1}
          </div>
        ))}
      </div>
      {/* Grid */}
      <div
        className={`flex-1 grid grid-cols-6 gap-[2px] p-1 rounded-xl border ${
          isEnemy
            ? 'bg-red-950/40 border-red-500/20'
            : isAlly
            ? 'bg-primary/[0.06] border-primary/20'
            : 'bg-card/60 border-border/40'
        }`}
      >
        {rowsTopDown.map((row) =>
          cols.map((col) => (
            <button
              key={`${col}-${row}`}
              onClick={() => {
                if (!interactive) return;
                // Only block clicking confirmed hits (destroyed cells)
                const wasHit = shotHistory.some((s) => s.pos.x === col && s.pos.y === row && s.hit);
                if (wasHit) return;
                onCellClick?.(col, row);
              }}
              disabled={!interactive}
              className={cellClasses(col, row)}
            >
              {cellContent(col, row)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Square-constrained grid wrapper                                    */
/* ------------------------------------------------------------------ */

function SquareGridWrapper({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);

  const measure = useCallback(() => {
    if (!ref.current) return;
    const h = ref.current.clientHeight;
    setSize(h);
  }, []);

  useEffect(() => {
    measure();
    const obs = new ResizeObserver(measure);
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [measure]);

  return (
    <div ref={ref} className="flex-1 min-h-0 flex items-center justify-center">
      <div style={size > 0 ? { width: size, height: size } : { width: '100%', height: '100%' }}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Zone labels                                                        */
/* ------------------------------------------------------------------ */

function ZoneLabel({ text, variant, compact }: { text: string; variant: 'enemy' | 'ally'; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-0.5">
      <div className={`h-px flex-1 ${variant === 'enemy' ? 'bg-red-500/25' : 'bg-primary/25'}`} />
      <span className={`font-bold uppercase tracking-[0.2em] ${
        compact ? 'text-[7px]' : 'text-[9px]'
      } ${variant === 'enemy' ? 'text-red-400/70' : 'text-primary/70'}`}>
        {text}
      </span>
      <div className={`h-px flex-1 ${variant === 'enemy' ? 'bg-red-500/25' : 'bg-primary/25'}`} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Battle divider                                                     */
/* ------------------------------------------------------------------ */

function BattleDivider({ compact }: { compact?: boolean }) {
  return (
    <div className={`relative flex items-center justify-center ${compact ? 'py-0.5' : 'py-1'}`}>
      <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="relative px-3 bg-background">
        <div className="flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 12 12" className="text-muted-foreground/40">
            <path d="M6 1L7.5 4.5H4.5L6 1Z" fill="currentColor" />
            <rect x="5.25" y="4.5" width="1.5" height="4" fill="currentColor" rx="0.5" />
            <circle cx="6" cy="10" r="1" fill="currentColor" />
          </svg>
          <span className="text-[7px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">vs</span>
          <svg width="10" height="10" viewBox="0 0 12 12" className="text-muted-foreground/40 rotate-180">
            <path d="M6 1L7.5 4.5H4.5L6 1Z" fill="currentColor" />
            <rect x="5.25" y="4.5" width="1.5" height="4" fill="currentColor" rx="0.5" />
            <circle cx="6" cy="10" r="1" fill="currentColor" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export                                                        */
/* ------------------------------------------------------------------ */

export function GameBoard({
  myPosition,
  blockedCells,
  lastShot,
  lastShotHit,
  moveTargets = [],
  onCellClick,
  selectedCell,
  mode,
  shotHistory = [],
  combined = false,
  incomingShot,
  incomingShotHit,
  showMissileAnimation,
  compact = false,
  disabledHalf = null,
  disabledOverlay,
}: GameBoardProps) {
  const { missileCell, impactCell } = useAnimatedCells(lastShot, lastShotHit);
  const animPhase = useDualMissiles(showMissileAnimation);

  if (combined || mode === 'select-position') {
    return (
      <div className="animate-fade-in flex flex-col h-full">
        <ColLabels variant="ally" compact={compact} />
        <SquareGridWrapper>
          <Grid
            variant="neutral"
            myPosition={myPosition}
            blockedCells={blockedCells}
            lastShot={lastShot}
            lastShotHit={lastShotHit}
            moveTargets={moveTargets}
            selectedCell={selectedCell}
            onCellClick={onCellClick}
            interactive={mode !== 'view'}
            shotHistory={shotHistory}
            missileCell={missileCell}
            impactCell={impactCell}
            compact={compact}
          />
        </SquareGridWrapper>
      </div>
    );
  }

  const enemyDisabled = disabledHalf === 'enemy' || disabledHalf === 'both';
  const allyDisabled = disabledHalf === 'ally' || disabledHalf === 'both';

  return (
    <div className="animate-fade-in flex flex-col h-full">
      {/* ENEMY RADAR — top half */}
      <div className={`flex-1 min-h-0 flex flex-col relative transition-opacity duration-300 ${
        enemyDisabled ? 'opacity-40 pointer-events-none' : ''
      }`}>
        <ZoneLabel text="Enemy Radar" variant="enemy" compact={compact} />
        <ColLabels variant="enemy" compact={compact} />
        <SquareGridWrapper>
          <Grid
            variant="enemy"
            myPosition={null}
            blockedCells={blockedCells}
            lastShot={lastShot}
            lastShotHit={lastShotHit}
            moveTargets={[]}
            selectedCell={mode === 'fire' ? selectedCell : null}
            onCellClick={mode === 'fire' ? onCellClick : undefined}
            interactive={mode === 'fire' && !enemyDisabled}
            shotHistory={shotHistory}
            missileCell={missileCell}
            impactCell={impactCell}
            compact={compact}
            animPhase={animPhase}
          />
        </SquareGridWrapper>
        {enemyDisabled && disabledOverlay && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            {disabledOverlay}
          </div>
        )}
      </div>

      <BattleDivider compact={compact} />

      {/* YOUR ZONE — bottom half */}
      <div className={`flex-1 min-h-0 flex flex-col relative transition-opacity duration-300 ${
        allyDisabled ? 'opacity-40 pointer-events-none' : ''
      }`}>
        <ZoneLabel text="Your Zone" variant="ally" compact={compact} />
        <ColLabels variant="ally" compact={compact} />
        <SquareGridWrapper>
          <Grid
            variant="ally"
            myPosition={myPosition}
            blockedCells={blockedCells}
            lastShot={mode === 'fire' ? null : lastShot}
            lastShotHit={mode === 'fire' ? null : lastShotHit}
            moveTargets={moveTargets}
            selectedCell={mode === 'move' ? selectedCell : null}
            onCellClick={mode === 'move' ? onCellClick : undefined}
            interactive={mode === 'move' && !allyDisabled}
            shotHistory={[]}
            missileCell={null}
            impactCell={null}
            incomingShot={incomingShot}
            incomingShotHit={incomingShotHit}
            compact={compact}
            animPhase={animPhase}
          />
        </SquareGridWrapper>
        {allyDisabled && disabledOverlay && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            {disabledOverlay}
          </div>
        )}
      </div>
    </div>
  );
}
