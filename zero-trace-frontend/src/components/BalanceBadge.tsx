import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  balance: string | null;
  onFund: () => void;
  loading?: boolean;
}

export function BalanceBadge({ balance, onFund, loading }: Props) {
  const numBalance = balance ? parseFloat(balance) : 0;
  const formatted = numBalance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const needsFunding = numBalance < 100;

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="font-mono text-xs">
        {balance === null ? '...' : `${formatted} XLM`}
      </Badge>
      {needsFunding && (
        <Button variant="outline" size="sm" onClick={onFund} disabled={loading} className="h-6 px-2 text-[10px]">
          {loading ? '...' : 'Fund'}
        </Button>
      )}
    </div>
  );
}
