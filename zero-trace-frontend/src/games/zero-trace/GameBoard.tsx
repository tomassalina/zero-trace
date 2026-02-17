import { useState, useEffect, useRef } from 'react';
import { type Position, GRID_SIZE } from './types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
  /** If true, show single combined board (for setup / finished) */
  combined?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Animation state for newly fired / hit cells                        */
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

function ColLabels({ variant }: { variant: 'enemy' | 'ally' }) {
  return (
    <div className="grid grid-cols-6 gap-[3px] mb-0.5">
      {cols.map((c) => (
        <div
          key={c}
          className={`text-center text-[8px] font-mono font-bold tracking-wider ${
            variant === 'enemy' ? 'text-red-400/40' : 'text-primary/40'
          }`}
        >
          {String.fromCharCode(65 + c)}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Single grid renderer                                               */
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
}: GridProps) {
  const isEnemy = variant === 'enemy';

  function cellClasses(x: number, y: number): string {
    const isSelected = selectedCell?.x === x && selectedCell?.y === y;
    const isMyPos = myPosition?.x === x && myPosition?.y === y;
    const isBlocked = blockedCells.some((c) => c.x === x && c.y === y);
    const isMoveTarget = moveTargets.some((c) => c.x === x && c.y === y);
    const isLastShot = lastShot?.x === x && lastShot?.y === y;
    const shot = shotHistory.find((s) => s.pos.x === x && s.pos.y === y);
    const isMissile = missileCell?.x === x && missileCell?.y === y;
    const isImpact = impactCell?.x === x && impactCell?.y === y;

    const base = 'relative aspect-square rounded-md border transition-all duration-200 flex items-center justify-center';

    if (isMissile) return `${base} border-primary/50 bg-primary/20`;
    if (isImpact && lastShotHit) return `${base} border-red-500/60 bg-red-500/20 animate-hit-shake`;
    if (isImpact && lastShotHit === false) return `${base} border-muted-foreground/30 bg-muted/30`;

    if (isSelected) {
      return `${base} border-primary bg-primary/25 ring-1 ring-primary/40 scale-[1.05]`;
    }
    if (isMyPos) {
      return `${base} border-primary/40 bg-primary/15`;
    }
    if (isLastShot && lastShotHit === true) {
      return `${base} border-red-500/50 bg-red-500/15 animate-cell-destroy`;
    }
    if (isLastShot && lastShotHit === false) {
      return `${base} border-muted-foreground/20 bg-muted/20`;
    }
    if (shot?.hit) {
      return `${base} border-red-500/30 bg-red-500/10`;
    }
    if (shot && !shot.hit) {
      return `${base} border-muted-foreground/15 bg-muted/10`;
    }
    if (isBlocked) {
      return `${base} border-muted-foreground/20 bg-muted/30`;
    }
    if (isMoveTarget) {
      return `${base} border-primary/30 bg-primary/5 grid-cell-interactive`;
    }
    if (interactive) {
      return `${base} ${
        isEnemy
          ? 'border-red-500/10 bg-red-500/[0.03] grid-cell-interactive hover:border-red-400/30 hover:bg-red-500/10'
          : 'border-primary/10 bg-primary/[0.03] grid-cell-interactive hover:border-primary/30 hover:bg-primary/10'
      }`;
    }
    return `${base} border-border/30 bg-card/30`;
  }

  function cellContent(x: number, y: number) {
    const isMyPos = myPosition?.x === x && myPosition?.y === y;
    const isLastShot = lastShot?.x === x && lastShot?.y === y;
    const shot = shotHistory.find((s) => s.pos.x === x && s.pos.y === y);
    const isMissile = missileCell?.x === x && missileCell?.y === y;
    const isImpact = impactCell?.x === x && impactCell?.y === y;
    const isMoveTarget = moveTargets.some((c) => c.x === x && c.y === y);

    if (isMissile) {
      return (
        <div className="animate-missile">
          <svg width="16" height="16" viewBox="0 0 16 16" className="text-primary">
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
          <svg width="20" height="20" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="4" fill="oklch(0.577 0.245 27.325)" opacity="0.8" />
            <circle cx="10" cy="10" r="7" fill="oklch(0.828 0.189 84.429)" opacity="0.4" />
            <circle cx="10" cy="10" r="2" fill="oklch(0.985 0.002 247.858)" opacity="0.9" />
          </svg>
        </div>
      );
    }
    if (isImpact && lastShotHit === false) {
      return <span className="text-muted-foreground/60 text-[10px] font-black animate-fade-in">MISS</span>;
    }

    if (isMyPos) {
      return (
        <div className="pulse-cyan rounded-full">
          <svg width="14" height="14" viewBox="0 0 14 14" className="text-primary animate-glow">
            <circle cx="7" cy="7" r="5" fill="currentColor" opacity="0.3" />
            <circle cx="7" cy="7" r="3" fill="currentColor" />
          </svg>
        </div>
      );
    }

    if (isLastShot && lastShotHit === true) {
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" className="text-red-400">
          <circle cx="7" cy="7" r="5" fill="currentColor" opacity="0.4" />
          <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    }
    if (isLastShot && lastShotHit === false) {
      return <span className="text-muted-foreground/50 text-[10px] font-bold">X</span>;
    }

    if (shot?.hit) {
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" className="text-red-400/70">
          <circle cx="5" cy="5" r="3" fill="currentColor" />
        </svg>
      );
    }
    if (shot && !shot.hit) {
      return <span className="text-muted-foreground/30 text-[8px] font-bold">x</span>;
    }

    if (isMoveTarget) {
      return (
        <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
      );
    }

    return null;
  }

  return (
    <div
      className={`grid grid-cols-6 gap-[3px] p-1.5 rounded-xl border ${
        isEnemy
          ? 'bg-red-950/20 border-red-500/10 dark:bg-red-950/10'
          : variant === 'ally'
          ? 'bg-primary/[0.03] border-primary/10'
          : 'bg-card/50 border-border/30'
      }`}
    >
      {rowsTopDown.map((row) =>
        cols.map((col) => (
          <button
            key={`${col}-${row}`}
            onClick={() => interactive && onCellClick?.(col, row)}
            disabled={!interactive}
            className={cellClasses(col, row)}
          >
            {cellContent(col, row)}
            {col === 0 && (
              <span className={`absolute -left-0 top-0 text-[6px] font-mono ${
                isEnemy ? 'text-red-400/25' : 'text-primary/25'
              }`}>
                {row + 1}
              </span>
            )}
          </button>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Zone labels                                                        */
/* ------------------------------------------------------------------ */

function ZoneLabel({ text, variant }: { text: string; variant: 'enemy' | 'ally' }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <div className={`h-px flex-1 ${variant === 'enemy' ? 'bg-red-500/15' : 'bg-primary/15'}`} />
      <span className={`text-[9px] font-bold uppercase tracking-[0.2em] ${
        variant === 'enemy' ? 'text-red-400/50' : 'text-primary/50'
      }`}>
        {text}
      </span>
      <div className={`h-px flex-1 ${variant === 'enemy' ? 'bg-red-500/15' : 'bg-primary/15'}`} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Divider between zones                                              */
/* ------------------------------------------------------------------ */

function BattleDivider() {
  return (
    <div className="relative flex items-center justify-center py-1.5">
      <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="relative px-3 bg-background">
        <div className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 12 12" className="text-muted-foreground/40">
            <path d="M6 1L7.5 4.5H4.5L6 1Z" fill="currentColor" />
            <rect x="5.25" y="4.5" width="1.5" height="4" fill="currentColor" rx="0.5" />
            <circle cx="6" cy="10" r="1" fill="currentColor" />
          </svg>
          <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
            vs
          </span>
          <svg width="12" height="12" viewBox="0 0 12 12" className="text-muted-foreground/40 rotate-180">
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
/*  Main export: split or combined board                                */
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
}: GameBoardProps) {
  const { missileCell, impactCell } = useAnimatedCells(lastShot, lastShotHit);

  // Combined mode: single board (setup, position select, finished)
  if (combined || mode === 'select-position') {
    return (
      <div className="animate-fade-in space-y-1">
        <ColLabels variant="ally" />
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
        />
      </div>
    );
  }

  // Split mode: Clash Royale style
  return (
    <div className="animate-fade-in space-y-1">
      {/* ENEMY RADAR — top half */}
      <ZoneLabel text="Enemy Radar" variant="enemy" />
      <ColLabels variant="enemy" />
      <Grid
        variant="enemy"
        myPosition={null}
        blockedCells={blockedCells}
        lastShot={lastShot}
        lastShotHit={lastShotHit}
        moveTargets={[]}
        selectedCell={mode === 'fire' ? selectedCell : null}
        onCellClick={mode === 'fire' ? onCellClick : undefined}
        interactive={mode === 'fire'}
        shotHistory={shotHistory}
        missileCell={missileCell}
        impactCell={impactCell}
      />

      <BattleDivider />

      {/* YOUR ZONE — bottom half */}
      <ZoneLabel text="Your Zone" variant="ally" />
      <ColLabels variant="ally" />
      <Grid
        variant="ally"
        myPosition={myPosition}
        blockedCells={blockedCells}
        lastShot={mode === 'fire' ? null : lastShot}
        lastShotHit={mode === 'fire' ? null : lastShotHit}
        moveTargets={moveTargets}
        selectedCell={mode === 'move' ? selectedCell : null}
        onCellClick={mode === 'move' ? onCellClick : undefined}
        interactive={mode === 'move'}
        shotHistory={[]}
        missileCell={null}
        impactCell={null}
      />
    </div>
  );
}
