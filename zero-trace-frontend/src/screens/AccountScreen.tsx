import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Copy, Check, RefreshCw, LogOut } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { GameHistory } from './account/GameHistory';
import { BadgesTab } from './account/BadgesTab';

export function AccountScreen() {
  const navigate = useNavigate();
  const { publicKey, balance, network, disconnect, refreshBalance, fundAccount } = useWallet();
  const [copied, setCopied] = useState(false);
  const [funding, setFunding] = useState(false);

  const handleCopy = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFund = async () => {
    setFunding(true);
    try { await fundAccount(); } finally { setFunding(false); }
  };

  const handleDisconnect = async () => {
    await disconnect();
    navigate('/');
  };

  const numBalance = balance ? parseFloat(balance) : 0;
  const formatted = numBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const networkLabel = network === 'mainnet' ? 'Mainnet' : network === 'testnet' ? 'Testnet' : 'Local';

  return (
    <div className="space-y-4 animate-fade-in pt-4">
      <h2 className="text-lg font-bold">Account</h2>

      <Tabs defaultValue="account">
        <TabsList className="w-full">
          <TabsTrigger value="account" className="flex-1">Account</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
          <TabsTrigger value="badges" className="flex-1">Badges</TabsTrigger>
        </TabsList>

        {/* ACCOUNT TAB */}
        <TabsContent value="account" className="mt-3 space-y-4">
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
                <Button variant="ghost" size="sm" onClick={() => refreshBalance()} className="h-6 px-2">
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

          {/* Network */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Network</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="inline-flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm font-medium text-emerald-400">{networkLabel}</span>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Disconnect */}
          <Button variant="destructive" className="w-full gap-2" onClick={handleDisconnect}>
            <LogOut size={14} />
            Disconnect Wallet
          </Button>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="mt-3">
          {publicKey && <GameHistory address={publicKey} />}
        </TabsContent>

        {/* BADGES TAB */}
        <TabsContent value="badges" className="mt-3">
          {publicKey && <BadgesTab address={publicKey} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
