export type GamePhase = 'lobby' | 'setup' | 'playing' | 'finished';

export type CellState = 'empty' | 'blocked' | 'miss' | 'hit' | 'your-position' | 'move-target';

/** Determines if an incoming shot hit our private position */
export function deriveHitResult(myPos: PrivateState, shot: { x: number; y: number }): boolean {
  return myPos.x === shot.x && myPos.y === shot.y;
}

export interface Position {
  x: number;
  y: number;
}

export interface PrivateState {
  x: number;
  y: number;
  salt: string; // bigint serialized
}

export interface PendingRoom {
  creator: string;
  stake: bigint;
  is_public: boolean;
  password_hash: Uint8Array;
  created_ledger: number;
}

export const GRID_SIZE = 6;

export function getStorageKey(sessionId: number, address: string): string {
  return `zero-trace-${sessionId}-${address}`;
}

export function savePrivateState(sessionId: number, address: string, state: PrivateState) {
  localStorage.setItem(getStorageKey(sessionId, address), JSON.stringify(state));
}

export function loadPrivateState(sessionId: number, address: string): PrivateState | null {
  const raw = localStorage.getItem(getStorageKey(sessionId, address));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function generateSalt(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  let hex = '0x';
  for (const b of arr) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function getAdjacentCells(x: number, y: number, blockedCells: Position[]): Position[] {
  const candidates = [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ];
  return candidates.filter(
    (c) =>
      c.x >= 0 && c.x < GRID_SIZE && c.y >= 0 && c.y < GRID_SIZE &&
      !blockedCells.some((b) => b.x === c.x && b.y === c.y)
  );
}
