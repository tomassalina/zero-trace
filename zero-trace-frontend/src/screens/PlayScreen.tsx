import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PlayScreen as PlayScreenType, Position, PrivateState } from '../games/zero-trace/types';
import { loadPrivateState, savePrivateState, generateSalt, getAdjacentCells } from '../games/zero-trace/types';
import { ZeroTraceService } from '../games/zero-trace/zeroTraceService';
import { GameBoard } from '../games/zero-trace/GameBoard';
import { useWallet } from '../hooks/useWallet';
import { ZERO_TRACE_CONTRACT } from '../utils/constants';
import { padPassword } from '../utils/password';
import { CreateRoomForm } from './play/CreateRoomForm';
import { WaitingRoom } from './play/WaitingRoom';
import { RoomList } from './play/RoomList';
import { Loader2, Trophy, Skull } from 'lucide-react';

const service = new ZeroTraceService(ZERO_TRACE_CONTRACT);

const createSessionId = (): number => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] || 1;
};

interface Props {
  initialAction?: string | null;
}

export function PlayScreen({ initialAction }: Props) {
  const { publicKey, getContractSigner } = useWallet();
  const userAddress = publicKey ?? '';

  const [screen, setScreen] = useState<PlayScreenType>(() => {
    if (initialAction === 'create') return 'create';
    if (initialAction === 'room-list') return 'room-list';
    return 'menu';
  });

  const [sessionId, setSessionId] = useState<number>(() => createSessionId());
  const [roomStake, setRoomStake] = useState('50');
  const [roomPassword, setRoomPassword] = useState('');
  const [roomIsPublic, setRoomIsPublic] = useState(true);

  const [gameData, setGameData] = useState<any>(null);
  const [privateState, setPrivateState] = useState<PrivateState | null>(null);
  const [selectedCell, setSelectedCell] = useState<Position | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [proofStatus, setProofStatus] = useState<string | null>(null);
  const [shotHistory, setShotHistory] = useState<{ pos: Position; hit: boolean }[]>([]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPlayer1 = gameData?.player1 === userAddress;
  const isMyTurn = gameData && (
    (gameData.current_turn === 1 && isPlayer1) || (gameData.current_turn === 2 && !isPlayer1)
  );
  const myCommitted = gameData && (
    (isPlayer1 && gameData.player1_committed) || (!isPlayer1 && gameData.player2_committed)
  );
  const waitingForResponse = gameData?.phase === 2;
  const iAmResponder = waitingForResponse && !isMyTurn;
  const blockedCells: Position[] = [];
  if (gameData) {
    for (let i = 0; i < (gameData.blocked_x?.length ?? 0); i++) {
      blockedCells.push({ x: gameData.blocked_x[i], y: gameData.blocked_y[i] });
    }
  }
  const lastShot = gameData?.has_last_shot ? { x: gameData.last_shot_x, y: gameData.last_shot_y } : null;
  const lastShotHit = gameData?.last_shot_hit === 2 ? true : gameData?.last_shot_hit === 1 ? false : null;
  const moveTargets = privateState ? getAdjacentCells(privateState.x, privateState.y, blockedCells) : [];

  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => { setError(null); setSuccess(null); }, 4000);
      return () => clearTimeout(t);
    }
  }, [error, success]);

  const pollGame = useCallback(async (sid: number) => {
    try {
      const data = await service.getGame(sid);
      if (data) {
        setGameData(data);
        const ps = loadPrivateState(sid, userAddress);
        if (ps) setPrivateState(ps);
        const phaseVal = data.phase;
        if (phaseVal === 0) setScreen('setup');
        else if (phaseVal === 1 || phaseVal === 2) setScreen('playing');
        else if (phaseVal === 3) setScreen('finished');
      }
    } catch (e) { console.log('[poll] error:', e); }
  }, [userAddress]);

  useEffect(() => {
    if (['setup', 'playing', 'finished'].includes(screen) && sessionId) {
      pollGame(sessionId);
      pollRef.current = setInterval(() => pollGame(sessionId), 4000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [screen, sessionId, pollGame]);

  useEffect(() => {
    if (initialAction === 'create' && screen === 'menu') setScreen('create');
    if (initialAction === 'room-list' && screen === 'menu') setScreen('room-list');
  }, [initialAction]);

  // ======== ROOM ACTIONS ========
  const handleCreateRoom = async (stake: bigint, isPublic: boolean, passwordHash: Uint8Array, password: string) => {
    const signer = getContractSigner();
    const sid = createSessionId();
    setSessionId(sid);
    setRoomStake((Number(stake) / 10_000_000).toFixed(0));
    setRoomPassword(password);
    setRoomIsPublic(isPublic);
    await service.createRoom(sid, userAddress, stake, isPublic, passwordHash, signer);
    setScreen('waiting');
  };

  const handleCancelRoom = async () => {
    const signer = getContractSigner();
    await service.cancelRoom(sessionId, userAddress, signer);
    setScreen('menu');
  };

  const checkForGame = useCallback(async (): Promise<boolean> => {
    const data = await service.getGame(sessionId);
    if (data) { setGameData(data); return true; }
    return false;
  }, [sessionId]);

  const handleJoinPublicRoom = async (sid: number) => {
    setLoading(true);
    setError(null);
    try {
      const signer = getContractSigner();
      setSessionId(sid);
      await service.joinRoom(sid, userAddress, new Uint8Array(32), signer);
      setSuccess('Joined room!');
      await pollGame(sid);
    } catch (e: any) { setError(e.message || 'Failed to join'); } finally { setLoading(false); }
  };

  const handleJoinPrivateRoom = async (sid: number, pw: string) => {
    setLoading(true);
    setError(null);
    try {
      const signer = getContractSigner();
      setSessionId(sid);
      await service.joinRoom(sid, userAddress, padPassword(pw), signer);
      setSuccess('Joined room!');
      await pollGame(sid);
    } catch (e: any) { setError(e.message || 'Failed to join'); } finally { setLoading(false); }
  };

  // ======== GAME ACTIONS ========
  const handleCommitPosition = async () => {
    if (!selectedCell) { setError('Select your starting position'); return; }
    setLoading(true);
    setProofStatus('Generating ZK proof...');
    try {
      const salt = generateSalt();
      const ps: PrivateState = { x: selectedCell.x, y: selectedCell.y, salt };
      savePrivateState(sessionId, userAddress, ps);
      setPrivateState(ps);
      const signer = getContractSigner();
      await service.commitPosition(sessionId, userAddress, ps, signer);
      setSuccess('Position committed on-chain!');
      setSelectedCell(null);
      setProofStatus(null);
      await pollGame(sessionId);
    } catch (e: any) { setError(e.message || 'Failed to commit'); setProofStatus(null); } finally { setLoading(false); }
  };

  const handleFire = async () => {
    if (!selectedCell) { setError('Select a target cell'); return; }
    setLoading(true);
    try {
      const signer = getContractSigner();
      await service.fire(sessionId, userAddress, selectedCell.x, selectedCell.y, signer);
      setSuccess(`Fired at ${String.fromCharCode(65 + selectedCell.x)}${selectedCell.y + 1}!`);
      setShotHistory((prev) => [...prev, { pos: selectedCell, hit: false }]);
      setSelectedCell(null);
      await pollGame(sessionId);
    } catch (e: any) { setError(e.message || 'Failed to fire'); } finally { setLoading(false); }
  };

  const handleRespond = async (hit: boolean) => {
    if (!privateState || !gameData) return;
    setLoading(true);
    setProofStatus('Generating ZK proofs...');
    try {
      const adjacents = getAdjacentCells(privateState.x, privateState.y, blockedCells);
      if (adjacents.length === 0) { setError('No valid moves!'); return; }
      const newPos = adjacents[Math.floor(Math.random() * adjacents.length)];
      const newSalt = generateSalt();
      const newState: PrivateState = { x: newPos.x, y: newPos.y, salt: newSalt };
      const signer = getContractSigner();
      await service.respond(sessionId, userAddress, hit, privateState, newState, signer);
      savePrivateState(sessionId, userAddress, newState);
      setPrivateState(newState);
      setSuccess(hit ? 'You were hit! Responded.' : 'Miss! Moved.');
      setProofStatus(null);
      await pollGame(sessionId);
    } catch (e: any) { setError(e.message || 'Failed to respond'); setProofStatus(null); } finally { setLoading(false); }
  };

  const handleClaimTimeout = async () => {
    setLoading(true);
    try {
      const signer = getContractSigner();
      await service.claimTimeout(sessionId, userAddress, signer);
      setSuccess('Timeout claimed!');
      await pollGame(sessionId);
    } catch (e: any) { setError(e.message || 'Cannot claim timeout yet'); } finally { setLoading(false); }
  };

  const resetGame = () => {
    setScreen('menu');
    setSessionId(createSessionId());
    setGameData(null);
    setPrivateState(null);
    setSelectedCell(null);
    setShotHistory([]);
  };

  return (
    <div className="space-y-4 animate-fade-in pt-2">
      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-3 text-destructive text-xs font-medium">{error}</CardContent>
        </Card>
      )}
      {success && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="p-3 text-green-500 text-xs font-medium">{success}</CardContent>
        </Card>
      )}
      {proofStatus && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 text-primary text-xs font-medium flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            {proofStatus}
          </CardContent>
        </Card>
      )}

      {/* MENU */}
      {screen === 'menu' && (
        <div className="space-y-3 pt-4">
          <h2 className="text-lg font-bold text-center">Play</h2>
          <Button className="w-full h-12" onClick={() => setScreen('create')}>Create Room</Button>
          <Button variant="outline" className="w-full h-12" onClick={() => setScreen('room-list')}>
            Browse Rooms
          </Button>
        </div>
      )}

      {screen === 'create' && <CreateRoomForm onSubmit={handleCreateRoom} onBack={() => setScreen('menu')} />}

      {screen === 'waiting' && (
        <WaitingRoom
          sessionId={sessionId} stake={roomStake} isPublic={roomIsPublic} password={roomPassword}
          onGameFound={() => pollGame(sessionId)} onCancel={handleCancelRoom} checkForGame={checkForGame}
        />
      )}

      {screen === 'room-list' && (
        <RoomList
          service={service}
          onJoinPublic={handleJoinPublicRoom}
          onJoinPrivate={handleJoinPrivateRoom}
          onBack={() => setScreen('menu')}
        />
      )}

      {/* SETUP */}
      {screen === 'setup' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Room #{sessionId}</span>
              <Badge variant="secondary">Setup Phase</Badge>
            </CardContent>
          </Card>

          {!myCommitted ? (
            <>
              <p className="text-xs text-center text-muted-foreground">Tap a cell to choose your starting position</p>
              <GameBoard
                myPosition={selectedCell} blockedCells={[]}
                onCellClick={(x, y) => setSelectedCell({ x, y })}
                selectedCell={selectedCell} mode="select-position"
                combined
              />
              <Button className="w-full h-12" onClick={handleCommitPosition} disabled={loading || !selectedCell}>
                {loading ? 'Committing...' : 'Commit Position (ZK Proof)'}
              </Button>
            </>
          ) : (
            <Card>
              <CardContent className="p-5 text-center space-y-2">
                <p className="text-sm font-medium text-green-500">Position committed!</p>
                <p className="text-xs text-muted-foreground">Waiting for opponent to commit...</p>
                <Loader2 className="mx-auto animate-spin text-primary mt-3" size={20} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* PLAYING */}
      {screen === 'playing' && gameData && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">#{sessionId}</span>
                <Badge variant="outline">Turn {gameData.turn_number + 1}</Badge>
              </div>
              <Badge variant={isMyTurn ? 'default' : 'secondary'}>
                {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
              </Badge>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Card>
              <CardContent className="p-2 text-center">
                <p className="text-[10px] text-muted-foreground">You</p>
                <p className={`text-sm font-bold ${(isPlayer1 ? gameData.player1_alive : gameData.player2_alive) ? 'text-green-500' : 'text-destructive'}`}>
                  {(isPlayer1 ? gameData.player1_alive : gameData.player2_alive) ? 'ALIVE' : 'HIT'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Enemy</p>
                <p className={`text-sm font-bold ${(isPlayer1 ? gameData.player2_alive : gameData.player1_alive) ? 'text-muted-foreground' : 'text-destructive'}`}>
                  {(isPlayer1 ? gameData.player2_alive : gameData.player1_alive) ? '???' : 'HIT'}
                </p>
              </CardContent>
            </Card>
          </div>

          <GameBoard
            myPosition={privateState ? { x: privateState.x, y: privateState.y } : null}
            blockedCells={blockedCells} lastShot={lastShot} lastShotHit={lastShotHit}
            moveTargets={iAmResponder ? moveTargets : []}
            onCellClick={(x, y) => !loading && setSelectedCell({ x, y })}
            selectedCell={selectedCell}
            mode={isMyTurn && !waitingForResponse ? 'fire' : iAmResponder ? 'move' : 'view'}
            shotHistory={shotHistory}
          />

          {isMyTurn && !waitingForResponse && (
            <Button variant="destructive" className="w-full h-12" onClick={handleFire} disabled={loading || !selectedCell}>
              {loading ? 'Firing...' : selectedCell
                ? `Fire at ${String.fromCharCode(65 + selectedCell.x)}${selectedCell.y + 1}`
                : 'Select target to fire'}
            </Button>
          )}

          {iAmResponder && (
            <div className="space-y-2">
              <p className="text-xs text-center font-medium text-muted-foreground">
                Incoming shot at {String.fromCharCode(65 + (lastShot?.x ?? 0))}{(lastShot?.y ?? 0) + 1}! Were you hit?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => handleRespond(false)} disabled={loading}>
                  {loading ? '...' : 'Miss'}
                </Button>
                <Button variant="destructive" onClick={() => handleRespond(true)} disabled={loading}>
                  {loading ? '...' : 'Hit'}
                </Button>
              </div>
            </div>
          )}

          {!isMyTurn && !iAmResponder && (
            <div className="text-center space-y-2">
              <Loader2 className="mx-auto animate-spin text-primary" size={20} />
              <p className="text-xs text-muted-foreground">Waiting for opponent...</p>
              <button onClick={handleClaimTimeout} className="text-[10px] text-muted-foreground hover:text-primary transition-colors">
                Claim timeout win
              </button>
            </div>
          )}
        </div>
      )}

      {/* FINISHED */}
      {screen === 'finished' && gameData && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              {gameData.winner === userAddress ? (
                <>
                  <Trophy size={40} className="mx-auto text-primary" />
                  <h2 className="text-xl font-black text-primary">YOU WIN!</h2>
                  <p className="text-xs text-muted-foreground">
                    Prize: {((Number(gameData.player1_points) + Number(gameData.player2_points)) * 0.9 / 10_000_000).toFixed(1)} XLM
                  </p>
                </>
              ) : (
                <>
                  <Skull size={40} className="mx-auto text-destructive" />
                  <h2 className="text-xl font-black text-destructive">DEFEATED</h2>
                  <p className="text-xs text-muted-foreground">Better luck next time.</p>
                </>
              )}
            </CardContent>
          </Card>

          <GameBoard
            myPosition={privateState ? { x: privateState.x, y: privateState.y } : null}
            blockedCells={blockedCells} lastShot={lastShot} lastShotHit={lastShotHit}
            mode="view" shotHistory={shotHistory} combined
          />

          <Button variant="outline" className="w-full h-12" onClick={resetGame}>New Game</Button>
        </div>
      )}
    </div>
  );
}
