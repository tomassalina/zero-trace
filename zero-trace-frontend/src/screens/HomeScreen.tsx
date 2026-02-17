import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Shield, Crosshair, Trophy } from 'lucide-react';
import type { AppScreen } from '../games/zero-trace/types';

interface Props {
  onNavigate: (screen: AppScreen, playAction?: string) => void;
}

export function HomeScreen({ onNavigate }: Props) {
  return (
    <div className="space-y-6 animate-fade-in pt-4">
      {/* Hero */}
      <div className="text-center space-y-3 py-8">
        <h2 className="text-5xl font-black tracking-tighter">
          ZERO<span className="text-primary">TRACE</span>
        </h2>
        <p className="text-sm text-muted-foreground font-medium">
          ZK Battleship. No lies. No mercy.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline">6x6 Grid</Badge>
          <Badge variant="outline">Poseidon2 ZK</Badge>
          <Badge variant="outline">Stellar</Badge>
        </div>
      </div>

      {/* CTAs */}
      <div className="space-y-3">
        <Button className="w-full h-12 text-sm font-bold" onClick={() => onNavigate('play', 'create')}>
          Create Room
        </Button>
        <Button variant="outline" className="w-full h-12 text-sm font-bold" onClick={() => onNavigate('play', 'room-list')}>
          Browse Rooms
        </Button>
      </div>

      <Separator />

      {/* How it works */}
      <div className="space-y-4">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-center">How it works</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <Shield size={20} />, title: 'Hide', desc: 'Commit position with ZK proof' },
            { icon: <Crosshair size={20} />, title: 'Hunt', desc: 'Fire shots, opponent proves hit/miss' },
            { icon: <Trophy size={20} />, title: 'Win', desc: 'Last standing takes the pot' },
          ].map((item) => (
            <Card key={item.title}>
              <CardContent className="p-3 text-center space-y-1">
                <div className="text-primary mx-auto w-fit">{item.icon}</div>
                <p className="text-xs font-bold">{item.title}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
