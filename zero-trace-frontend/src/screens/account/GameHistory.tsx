import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, Search } from 'lucide-react';
import { getHistory, type GameRecord } from '@/services/historyService';

const PAGE_SIZE = 20;

interface Props {
  address: string;
}

export function GameHistory({ address }: Props) {
  const [search, setSearch] = useState('');
  const [sortNewest, setSortNewest] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const allRecords = useMemo(() => getHistory(address), [address]);

  const filtered = useMemo(() => {
    let records = allRecords;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      records = records.filter(
        (r) =>
          String(r.sessionId).includes(q) ||
          r.opponent.toLowerCase().includes(q)
      );
    }
    if (!sortNewest) {
      records = [...records].reverse();
    }
    return records;
  }, [allRecords, search, sortNewest]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const resultBadge = (result: GameRecord['result']) => {
    switch (result) {
      case 'win':
        return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">Win</Badge>;
      case 'loss':
        return <Badge className="bg-red-500/15 text-red-400 border-red-500/20 text-[10px]">Loss</Badge>;
      case 'draw':
        return <Badge className="bg-primary/15 text-primary border-primary/20 text-[10px]">Draw</Badge>;
    }
  };

  if (allRecords.length === 0) {
    return (
      <div className="py-12 text-center space-y-2">
        <p className="text-sm text-muted-foreground">No games played yet</p>
        <p className="text-xs text-muted-foreground/60">Your match history will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search + Sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by ID or wallet..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortNewest(!sortNewest)}
          className="h-8 px-2 gap-1 text-[10px]"
        >
          <ArrowUpDown size={12} />
          {sortNewest ? 'Newest' : 'Oldest'}
        </Button>
      </div>

      {/* Records */}
      <div className="space-y-2">
        {visible.map((record) => (
          <Card key={record.sessionId}>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold">#{record.sessionId}</span>
                  {resultBadge(record.result)}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  vs {record.opponent.slice(0, 6)}...{record.opponent.slice(-4)}
                </p>
              </div>
              <div className="text-right space-y-0.5 shrink-0 ml-2">
                <p className="text-xs font-medium">{record.stake} XLM</p>
                <p className="text-[10px] text-muted-foreground">
                  {record.rounds} {record.rounds === 1 ? 'round' : 'rounds'}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <Button
          variant="ghost"
          className="w-full text-xs text-muted-foreground"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
        >
          Load more ({filtered.length - visibleCount} remaining)
        </Button>
      )}

      {filtered.length === 0 && search && (
        <p className="text-center text-xs text-muted-foreground py-4">No matches found</p>
      )}
    </div>
  );
}
