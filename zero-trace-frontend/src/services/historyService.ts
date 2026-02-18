const HISTORY_PREFIX = 'zt-history-';
const STATS_PREFIX = 'zt-stats-';

export interface GameRecord {
  sessionId: number;
  opponent: string;
  result: 'win' | 'loss' | 'draw';
  stake: number;
  date: string;
  rounds: number;
}

export interface PlayerStats {
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  currentStreak: number;
  bestStreak: number;
}

function getHistoryKey(address: string): string {
  return `${HISTORY_PREFIX}${address}`;
}

function getStatsKey(address: string): string {
  return `${STATS_PREFIX}${address}`;
}

export function saveGameResult(address: string, record: GameRecord): void {
  const history = getHistory(address);
  // Avoid duplicates
  if (history.some((r) => r.sessionId === record.sessionId)) return;
  history.unshift(record);
  localStorage.setItem(getHistoryKey(address), JSON.stringify(history));

  // Update stats
  const stats = getStats(address);
  if (record.result === 'win') {
    stats.totalWins++;
    stats.currentStreak++;
    if (stats.currentStreak > stats.bestStreak) {
      stats.bestStreak = stats.currentStreak;
    }
  } else if (record.result === 'loss') {
    stats.totalLosses++;
    stats.currentStreak = 0;
  } else {
    stats.totalDraws++;
    // Draws don't break streak
  }
  localStorage.setItem(getStatsKey(address), JSON.stringify(stats));
}

export function getHistory(address: string): GameRecord[] {
  try {
    const raw = localStorage.getItem(getHistoryKey(address));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function getStats(address: string): PlayerStats {
  try {
    const raw = localStorage.getItem(getStatsKey(address));
    if (!raw) return { totalWins: 0, totalLosses: 0, totalDraws: 0, currentStreak: 0, bestStreak: 0 };
    return JSON.parse(raw);
  } catch {
    return { totalWins: 0, totalLosses: 0, totalDraws: 0, currentStreak: 0, bestStreak: 0 };
  }
}
