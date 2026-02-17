import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Loader2 } from 'lucide-react';

interface Props {
  sessionId: number;
  stake: string;
  isPublic: boolean;
  password: string;
  onGameFound: () => void;
  onCancel: () => Promise<void>;
  checkForGame: () => Promise<boolean>;
}

export function WaitingRoom({ sessionId, stake, isPublic, password, onGameFound, onCancel, checkForGame }: Props) {
  const [copied, setCopied] = useState<'id' | 'pw' | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const found = await checkForGame();
      if (found) onGameFound();
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [checkForGame, onGameFound]);

  const copy = (text: string, type: 'id' | 'pw') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCancel = async () => {
    setCancelling(true);
    try { await onCancel(); } finally { setCancelling(false); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card>
        <CardContent className="p-5 text-center space-y-4">
          <Loader2 className="mx-auto animate-spin text-primary" size={28} />
          <div>
            <h2 className="text-lg font-bold">Waiting for opponent</h2>
            <p className="text-xs text-muted-foreground mt-1">Share the room details below</p>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Room ID</p>
            <button
              onClick={() => copy(String(sessionId), 'id')}
              className="font-mono text-xl font-black text-primary hover:opacity-80 transition-opacity flex items-center gap-2 mx-auto"
            >
              {sessionId}
              {copied === 'id' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>

          <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
            <span>Stake: <strong className="text-foreground">{stake} XLM</strong></span>
            <Badge variant={isPublic ? 'default' : 'secondary'}>
              {isPublic ? 'Public' : 'Private'}
            </Badge>
          </div>

          {!isPublic && password && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Password</p>
              <button
                onClick={() => copy(password, 'pw')}
                className="font-mono text-sm font-bold text-primary hover:opacity-80 transition-opacity flex items-center gap-2 mx-auto"
              >
                {password}
                {copied === 'pw' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full" onClick={handleCancel} disabled={cancelling}>
        {cancelling ? 'Cancelling...' : 'Cancel Room'}
      </Button>
    </div>
  );
}
