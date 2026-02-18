import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Search, ArrowUpDown, Clock } from 'lucide-react';
import { ZeroTraceService } from '@/games/zero-trace/zeroTraceService';
import { useWallet } from '@/hooks/useWallet';
import { padPassword } from '@/utils/password';
import { ZERO_TRACE_CONTRACT, RPC_URL } from '@/utils/constants';

const service = new ZeroTraceService(ZERO_TRACE_CONTRACT);
const ROOM_TIMEOUT_LEDGERS = 120;
const LEDGER_TIME_SECONDS = 5;

interface RoomInfo {
  sessionId: number;
  creator: string;
  stake: string;
  stakeNum: number;
  isPublic: boolean;
  createdLedger: number;
  remainingSeconds: number;
}

type SortMode = 'expiring' | 'expensive' | 'cheap';

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

export function RoomList() {
  const navigate = useNavigate();
  const { publicKey, getContractSigner } = useWallet();
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinId, setJoinId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [joiningPrivate, setJoiningPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('expiring');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      const [ids, currentLedger] = await Promise.all([
        service.listPublicRooms(),
        getCurrentLedger(),
      ]);
      const roomInfos: RoomInfo[] = [];
      for (const id of ids) {
        const room = await service.getRoom(id);
        if (room) {
          const elapsed = currentLedger - room.created_ledger;
          const remainingLedgers = Math.max(0, ROOM_TIMEOUT_LEDGERS - elapsed);
          const stakeNum = Number(room.stake) / 10_000_000;
          roomInfos.push({
            sessionId: id,
            creator: room.creator,
            stake: stakeNum.toFixed(0),
            stakeNum,
            isPublic: room.is_public,
            createdLedger: room.created_ledger,
            remainingSeconds: remainingLedgers * LEDGER_TIME_SECONDS,
          });
        }
      }
      setRooms(roomInfos);
    } catch (e) {
      console.log('[RoomList] error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll rooms every 5s
  useEffect(() => {
    fetchRooms();
    pollRef.current = setInterval(fetchRooms, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchRooms]);

  // Tick countdown every second
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRooms((prev) =>
        prev.map((r) => ({
          ...r,
          remainingSeconds: Math.max(0, r.remainingSeconds - 1),
        })).filter((r) => r.remainingSeconds > 0)
      );
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const sortedFiltered = useMemo(() => {
    let result = rooms;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) =>
          String(r.sessionId).includes(q) ||
          r.creator.toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      switch (sortMode) {
        case 'expiring': return a.remainingSeconds - b.remainingSeconds;
        case 'expensive': return b.stakeNum - a.stakeNum;
        case 'cheap': return a.stakeNum - b.stakeNum;
      }
    });
  }, [rooms, search, sortMode]);

  const cycleSortMode = () => {
    setSortMode((prev) => {
      if (prev === 'expiring') return 'expensive';
      if (prev === 'expensive') return 'cheap';
      return 'expiring';
    });
  };

  const sortLabel = sortMode === 'expiring' ? 'Expiring' : sortMode === 'expensive' ? 'High $' : 'Low $';

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const handleJoinPublic = async (sid: number) => {
    setJoiningId(sid);
    setError(null);
    try {
      const signer = getContractSigner();
      await service.joinRoom(sid, publicKey!, new Uint8Array(32), signer);
      navigate(`/room/${sid}`);
    } catch (e: any) {
      setError(e.message || 'Failed to join');
    } finally {
      setJoiningId(null);
    }
  };

  const handleJoinPrivate = async () => {
    const sid = parseInt(joinId, 10);
    if (!sid || !joinPassword) return;
    setJoiningPrivate(true);
    setError(null);
    try {
      const signer = getContractSigner();
      await service.joinRoom(sid, publicKey!, padPassword(joinPassword), signer);
      navigate(`/room/${sid}`);
    } catch (e: any) {
      setError(e.message || 'Failed to join');
    } finally {
      setJoiningPrivate(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/play')}><ArrowLeft size={18} /></Button>
        <h2 className="text-lg font-bold">Find Room</h2>
        {loading && <Loader2 size={14} className="animate-spin text-primary" />}
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-3 text-destructive text-xs">{error}</CardContent>
        </Card>
      )}

      <Tabs defaultValue="public">
        <TabsList className="w-full">
          <TabsTrigger value="public" className="flex-1">Public</TabsTrigger>
          <TabsTrigger value="private" className="flex-1">Private</TabsTrigger>
        </TabsList>

        <TabsContent value="public" className="space-y-3 mt-3">
          {/* Search + Sort */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by ID or address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={cycleSortMode}
              className="h-8 px-2 gap-1 text-[10px] shrink-0"
            >
              <ArrowUpDown size={12} />
              {sortLabel}
            </Button>
          </div>

          {sortedFiltered.length === 0 && !loading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground">No public rooms available</p>
                <p className="text-xs text-muted-foreground mt-1">Create one and start playing!</p>
              </CardContent>
            </Card>
          ) : (
            sortedFiltered.map((room) => (
              <Card key={room.sessionId}>
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm font-bold">#{room.sessionId}</p>
                      <Badge
                        variant="outline"
                        className={`text-[9px] gap-1 ${
                          room.remainingSeconds < 60
                            ? 'text-red-400 border-red-500/20'
                            : room.remainingSeconds < 180
                            ? 'text-yellow-400 border-yellow-500/20'
                            : 'text-muted-foreground'
                        }`}
                      >
                        <Clock size={8} />
                        {formatTime(room.remainingSeconds)}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {room.creator.slice(0, 6)}...{room.creator.slice(-4)} · {room.stake} XLM
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleJoinPublic(room.sessionId)}
                    disabled={joiningId !== null}
                  >
                    {joiningId === room.sessionId ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      'Join'
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="private" className="mt-3">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="space-y-2">
                <Label>Room ID</Label>
                <Input type="text" value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="Enter room ID" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="text" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} placeholder="Enter password" />
              </div>
              <Button className="w-full" onClick={handleJoinPrivate} disabled={joiningPrivate || !joinId || !joinPassword}>
                {joiningPrivate ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Joining...
                  </span>
                ) : (
                  'Join Room'
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
