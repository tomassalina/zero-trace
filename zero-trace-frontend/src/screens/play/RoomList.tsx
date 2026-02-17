import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ZeroTraceService } from '@/games/zero-trace/zeroTraceService';

interface RoomInfo {
  sessionId: number;
  creator: string;
  stake: string;
  isPublic: boolean;
}

interface Props {
  service: ZeroTraceService;
  onJoinPublic: (sessionId: number) => void;
  onJoinPrivate: (sessionId: number, password: string) => void;
  onBack: () => void;
}

export function RoomList({ service, onJoinPublic, onJoinPrivate, onBack }: Props) {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinId, setJoinId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joining, setJoining] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      const ids = await service.listPublicRooms();
      const roomInfos: RoomInfo[] = [];
      for (const id of ids) {
        const room = await service.getRoom(id);
        if (room) {
          roomInfos.push({
            sessionId: id,
            creator: room.creator,
            stake: (Number(room.stake) / 10_000_000).toFixed(0),
            isPublic: room.is_public,
          });
        }
      }
      setRooms(roomInfos);
    } catch (e) {
      console.log('[RoomList] error:', e);
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    fetchRooms();
    pollRef.current = setInterval(fetchRooms, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchRooms]);

  const handleJoinPrivate = () => {
    const sid = parseInt(joinId, 10);
    if (!sid || !joinPassword) return;
    setJoining(true);
    onJoinPrivate(sid, joinPassword);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft size={18} /></Button>
        <h2 className="text-lg font-bold">Find Room</h2>
        {loading && <Loader2 size={14} className="animate-spin text-primary" />}
      </div>

      <Tabs defaultValue="public">
        <TabsList className="w-full">
          <TabsTrigger value="public" className="flex-1">Public</TabsTrigger>
          <TabsTrigger value="private" className="flex-1">Private</TabsTrigger>
        </TabsList>

        <TabsContent value="public" className="space-y-2 mt-3">
          {rooms.length === 0 && !loading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground">No public rooms available</p>
                <p className="text-xs text-muted-foreground mt-1">Create one and start playing!</p>
              </CardContent>
            </Card>
          ) : (
            rooms.map((room) => (
              <Card key={room.sessionId}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-mono text-sm font-bold">#{room.sessionId}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {room.creator.slice(0, 6)}...{room.creator.slice(-4)} · {room.stake} XLM
                    </p>
                  </div>
                  <Button size="sm" onClick={() => onJoinPublic(room.sessionId)}>Join</Button>
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
              <Button className="w-full" onClick={handleJoinPrivate} disabled={joining || !joinId || !joinPassword}>
                {joining ? 'Joining...' : 'Join Room'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
