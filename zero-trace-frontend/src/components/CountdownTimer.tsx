import { useState, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';
import { RPC_URL } from '@/utils/constants';

const LEDGER_TIME_SECONDS = 5;

interface Props {
  lastActionLedger: number;
  timeoutLedgers: number;
  label?: string;
}

async function getCurrentLedger(): Promise<number> {
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' }),
    });
    const data = await res.json();
    return data.result.sequence;
  } catch {
    return 0;
  }
}

export function CountdownTimer({ lastActionLedger, timeoutLedgers, label }: Props) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync with RPC
  useEffect(() => {
    const sync = async () => {
      const current = await getCurrentLedger();
      if (current > 0) {
        const elapsed = current - lastActionLedger;
        const remainingLedgers = Math.max(0, timeoutLedgers - elapsed);
        setRemaining(remainingLedgers * LEDGER_TIME_SECONDS);
      }
    };

    sync();
    syncRef.current = setInterval(sync, 30000);
    return () => { if (syncRef.current) clearInterval(syncRef.current); };
  }, [lastActionLedger, timeoutLedgers]);

  // Local tick every second
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setRemaining((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  if (remaining === null) return null;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;

  const isUrgent = remaining < 60;
  const isWarning = remaining >= 60 && remaining < 120;

  return (
    <div
      className={`inline-flex items-center gap-1.5 font-mono text-xs font-bold ${
        isUrgent
          ? 'text-red-400 animate-pulse'
          : isWarning
          ? 'text-yellow-400'
          : 'text-emerald-400'
      }`}
    >
      <Clock size={12} />
      {label && <span className="font-normal text-[10px] opacity-70">{label}</span>}
      <span>{timeStr}</span>
    </div>
  );
}
