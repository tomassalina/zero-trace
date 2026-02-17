import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Shuffle } from 'lucide-react';
import { hashPassword, zeroHash, generateRoomPassword } from '@/utils/password';

interface Props {
  onSubmit: (stake: bigint, isPublic: boolean, passwordHash: Uint8Array, password: string) => Promise<void>;
  onBack: () => void;
}

export function CreateRoomForm({ onSubmit, onBack }: Props) {
  const [stake, setStake] = useState('50');
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => setPassword(generateRoomPassword());

  const handleSubmit = async () => {
    const stakeNum = parseFloat(stake);
    if (!stakeNum || stakeNum < 1) { setError('Minimum stake: 1 XLM'); return; }
    setLoading(true);
    setError(null);
    try {
      const stakeStroops = BigInt(Math.round(stakeNum * 10_000_000));
      const pwHash = isPublic ? zeroHash() : hashPassword(password);
      await onSubmit(stakeStroops, isPublic, pwHash, password);
    } catch (e: any) {
      setError(e.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft size={18} /></Button>
        <h2 className="text-lg font-bold">Create Room</h2>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-3 text-destructive text-xs">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Stake (XLM)</Label>
            <Input type="number" min="1" value={stake} onChange={(e) => setStake(e.target.value)} />
            <div className="flex gap-2">
              {['10', '50', '100', '500'].map((v) => (
                <Button
                  key={v}
                  variant={stake === v ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setStake(v)}
                >
                  {v}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Room Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={isPublic ? 'default' : 'outline'}
                onClick={() => setIsPublic(true)}
              >
                Public
              </Button>
              <Button
                variant={!isPublic ? 'secondary' : 'outline'}
                onClick={() => { setIsPublic(false); if (!password) handleGenerate(); }}
              >
                Private
              </Button>
            </div>
          </div>

          {!isPublic && (
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="flex gap-2">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                />
                <Button variant="outline" size="icon" onClick={handleGenerate} title="Auto-generate">
                  <Shuffle size={14} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Button className="w-full h-12" onClick={handleSubmit} disabled={loading || (!isPublic && !password)}>
        {loading ? 'Creating...' : `Create Room (${stake} XLM stake)`}
      </Button>
    </div>
  );
}
