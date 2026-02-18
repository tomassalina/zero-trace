import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Swords } from 'lucide-react';
import { useActiveGame } from '@/hooks/useActiveGame';

export function ActiveGameGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { activeSessionId, loading } = useActiveGame();

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activeSessionId !== null) {
    return (
      <div className="pt-4 animate-fade-in">
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
      </div>
    );
  }

  return <>{children}</>;
}
