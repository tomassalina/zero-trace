import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Swords } from 'lucide-react';
import { useActiveGame } from '@/hooks/useActiveGame';

export function PlayMenu() {
  const navigate = useNavigate();
  const { activeSessionId, loading } = useActiveGame();

  return (
    <div className="space-y-3 pt-4 animate-fade-in">
      <h2 className="text-lg font-bold text-center">Play</h2>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : activeSessionId !== null ? (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <Swords size={18} />
              <p className="text-sm font-bold">Game in Progress</p>
            </div>
            <p className="text-xs text-muted-foreground">
              You have an active game (#{activeSessionId}). Resume it to continue playing.
            </p>
            <Button className="w-full" onClick={() => navigate(`/room/${activeSessionId}`)}>
              Resume Game
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Button className="w-full h-12" onClick={() => navigate('/play/create')}>
            Create Room
          </Button>
          <Button variant="outline" className="w-full h-12" onClick={() => navigate('/play/rooms')}>
            Browse Rooms
          </Button>
        </>
      )}
    </div>
  );
}
