import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useTheme } from '@/components/ThemeProvider';
import { Copy, Check, RefreshCw, Sun, Moon } from 'lucide-react';

interface Props {
  publicKey: string;
  balance: string | null;
  onFund: () => Promise<void>;
  onReset: () => void;
  onRefreshBalance: () => Promise<any>;
}

export function ProfileScreen({ publicKey, balance, onFund, onReset, onRefreshBalance }: Props) {
  const [copied, setCopied] = useState(false);
  const [funding, setFunding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleCopy = () => {
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFund = async () => {
    setFunding(true);
    try { await onFund(); } finally { setFunding(false); }
  };

  const numBalance = balance ? parseFloat(balance) : 0;
  const formatted = numBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4 animate-fade-in pt-4">
      <h2 className="text-lg font-bold">Account</h2>

      {/* Theme Toggle */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <span className="text-sm font-medium">Theme</span>
          <Button variant="outline" size="sm" onClick={toggleTheme} className="gap-2">
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </Button>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Stellar Address</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <button
            onClick={handleCopy}
            className="w-full text-left font-mono text-xs text-primary break-all hover:opacity-80 transition-opacity flex items-start gap-2"
          >
            <span className="flex-1">{publicKey}</span>
            {copied ? <Check size={14} className="shrink-0 text-green-500" /> : <Copy size={14} className="shrink-0" />}
          </button>
        </CardContent>
      </Card>

      {/* Balance */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Balance</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onRefreshBalance()} className="h-6 px-2">
              <RefreshCw size={12} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-2xl font-black">
            {balance === null ? '...' : `${formatted} XLM`}
          </p>
          <Button variant="outline" className="w-full" onClick={handleFund} disabled={funding}>
            {funding ? 'Funding...' : 'Fund 10,000 XLM (Testnet)'}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Danger Zone */}
      <Card className="border-destructive/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {!resetting ? (
            <Button variant="destructive" className="w-full" onClick={() => setResetting(true)}>
              Reset Account
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-destructive">This will generate a new keypair. Your balance and games will be lost.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setResetting(false)}>Cancel</Button>
                <Button variant="destructive" onClick={() => { onReset(); setResetting(false); }}>Confirm</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
