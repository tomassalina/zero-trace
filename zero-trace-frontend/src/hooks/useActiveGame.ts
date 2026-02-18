import { useState, useEffect } from 'react';
import { ZeroTraceService } from '@/games/zero-trace/zeroTraceService';
import { ZERO_TRACE_CONTRACT } from '@/utils/constants';
import { useWalletStore } from '@/store/walletSlice';

const service = new ZeroTraceService(ZERO_TRACE_CONTRACT);

let cachedSessionId: number | null = null;
let cacheKey: string | null = null;

export function useActiveGame() {
  const publicKey = useWalletStore((s) => s.publicKey);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(cachedSessionId);
  const [loading, setLoading] = useState(cacheKey !== publicKey);

  useEffect(() => {
    if (!publicKey) {
      setActiveSessionId(null);
      setLoading(false);
      cachedSessionId = null;
      cacheKey = null;
      return;
    }
    if (cacheKey === publicKey) {
      setActiveSessionId(cachedSessionId);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sid = await service.getActiveGame(publicKey);
        if (!cancelled) {
          const val = sid ?? null;
          cachedSessionId = val;
          cacheKey = publicKey;
          setActiveSessionId(val);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [publicKey]);

  const refresh = () => {
    cacheKey = null;
    if (publicKey) {
      setLoading(true);
      service.getActiveGame(publicKey).then((sid) => {
        cachedSessionId = sid ?? null;
        cacheKey = publicKey;
        setActiveSessionId(cachedSessionId);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  };

  return { activeSessionId, loading, refresh };
}
