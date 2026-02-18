import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Copy, Check, LogOut, Wallet } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';

export function WalletButton() {
  const { publicKey, isConnected, balance, network, connect, disconnect } = useWallet();
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await connect();
    } finally {
      setConnecting(false);
    }
  };

  const handleCopy = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const numBalance = balance ? parseFloat(balance) : 0;
  const formatted = numBalance.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const truncatedAddress = publicKey
    ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`
    : '';

  const networkLabel = network === 'mainnet' ? 'Mainnet' : network === 'testnet' ? 'Testnet' : 'Local';

  if (!isConnected) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleConnect}
        disabled={connecting}
        className="h-7 px-3 text-xs font-medium gap-1.5"
      >
        <Wallet size={12} />
        {connecting ? 'Connecting...' : 'Connect'}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/50 border border-border/50 hover:bg-secondary/80 transition-colors cursor-pointer">
          <span className="font-mono text-xs font-medium text-foreground">
            {balance === null ? '...' : `${formatted} XLM`}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-3 space-y-3">
        {/* Address */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Address</p>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 text-xs font-mono text-primary hover:opacity-80 transition-opacity w-full"
          >
            <span>{truncatedAddress}</span>
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
          </button>
        </div>

        {/* Network */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Network</p>
          <div className="inline-flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-emerald-400">{networkLabel}</span>
          </div>
        </div>

        {/* Balance */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Balance</p>
          <p className="text-sm font-bold">{balance === null ? '...' : `${formatted} XLM`}</p>
        </div>

        <DropdownMenuSeparator />

        {/* Disconnect */}
        <button
          onClick={disconnect}
          className="flex items-center gap-2 text-xs text-destructive hover:opacity-80 transition-opacity w-full py-1"
        >
          <LogOut size={12} />
          <span>Disconnect</span>
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
