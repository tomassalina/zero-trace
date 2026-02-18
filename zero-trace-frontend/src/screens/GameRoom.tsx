import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, Trophy, Skull, Equal, AlertTriangle } from 'lucide-react';
import { GameBoard } from '../games/zero-trace/GameBoard';
import { CountdownTimer } from '../components/CountdownTimer';
import { FloatingAction } from '../components/FloatingAction';
import { SideControls } from '../components/SideControls';
import {
  type Position,
  type PrivateState,
  loadPrivateState,
  savePrivateState,
  generateSalt,
  getAdjacentCells,
  deriveHitResult,
} from '../games/zero-trace/types';
import { ZeroTraceService } from '../games/zero-trace/zeroTraceService';
import { useWallet } from '../hooks/useWallet';
import { ZERO_TRACE_CONTRACT } from '../utils/constants';
import { parseContractError } from '../utils/contractErrors';
import { WaitingRoom } from './play/WaitingRoom';
import { hashPassword, generateRoomPassword } from '../utils/password';
import { saveGameResult } from '../services/historyService';

const service = new ZeroTraceService(ZERO_TRACE_CONTRACT);
const SETUP_TIMEOUT_LEDGERS = 36;
const ACTION_TIMEOUT_LEDGERS = 36;

const GAME_H = 'calc(100dvh - var(--header-h, 48px) - var(--nav-h, 56px))';

const createSessionId = (): number => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] || 1;
};

export function GameRoom() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { publicKey, getContractSigner } = useWallet();
  const userAddress = publicKey ?? '';
  const sessionId = parseInt(id ?? '0', 10);

  const locState = (location.state ?? {}) as { stake?: number; password?: string; isPublic?: boolean };

  const [gameData, setGameData] = useState<any>(null);
  const [roomExists, setRoomExists] = useState<boolean | null>(null);
  const [privateState, setPrivateState] = useState<PrivateState | null>(null);
  const [selectedCell, setSelectedCell] = useState<Position | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoResponding, setAutoResponding] = useState(false);
  const [shotHistory, setShotHistory] = useState<{ pos: Position; hit: boolean }[]>([]);
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showMissiles, setShowMissiles] = useState(false);
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  const respondedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPhase = useRef<number | null>(null);
  const savedResult = useRef(false);

  // Derived state
  const isPlayer1 = gameData?.player1 === userAddress;
  const phase = gameData?.phase;

  const blockedCells: Position[] = [];
  if (gameData) {
    for (let i = 0; i < (gameData.blocked_x?.length ?? 0); i++) {
      blockedCells.push({ x: gameData.blocked_x[i], y: gameData.blocked_y[i] });
    }
  }

  const myHasShot = gameData && (isPlayer1 ? gameData.player1_has_shot : gameData.player2_has_shot);
  const myResponded = gameData && (isPlayer1 ? gameData.player1_responded : gameData.player2_responded);
  const myCommitted = gameData && (isPlayer1 ? gameData.player1_committed : gameData.player2_committed);

  const incomingShot = gameData && phase === 2 ? {
    x: isPlayer1 ? gameData.player2_shot_x : gameData.player1_shot_x,
    y: isPlayer1 ? gameData.player2_shot_y : gameData.player1_shot_y,
  } : null;

  const myShot = gameData && myHasShot ? {
    x: isPlayer1 ? gameData.player1_shot_x : gameData.player2_shot_x,
    y: isPlayer1 ? gameData.player1_shot_y : gameData.player2_shot_y,
  } : null;

  const moveTargets = privateState && phase === 2 && !myResponded
    ? getAdjacentCells(privateState.x, privateState.y, blockedCells)
    : [];

  const wasHitByOpponent = privateState && incomingShot ? deriveHitResult(privateState, incomingShot) : null;
  const myLastShotHit = gameData && phase === 2 && myShot
    ? (isPlayer1 ? gameData.player2_was_hit : gameData.player1_was_hit)
    : null;

  // Should show floating action?
  const shouldShowAction =
    (phase === 0 && !myCommitted) ||
    (phase === 1 && !myHasShot) ||
    (phase === 2 && !myResponded && !autoResponding && wasHitByOpponent === false) ||
    phase === 3;

  // Should show timeout side control?
  const showTimeoutControl =
    (phase === 1 && myHasShot) ||
    (phase === 2 && myResponded);

  // Check terms acceptance
  const termsKey = `zt-terms-${sessionId}`;
  useEffect(() => {
    if (sessionStorage.getItem(termsKey)) setTermsAccepted(true);
  }, [termsKey]);

  // Phase transition effects
  useEffect(() => {
    if (phase === null || phase === undefined) return;
    if (prevPhase.current !== null && prevPhase.current !== phase) {
      if (prevPhase.current === 0 && phase === 1) {
        setPhaseMessage('Battle Begins!');
      } else if (prevPhase.current === 1 && phase === 2) {
        setShowMissiles(true);
        setTimeout(() => setShowMissiles(false), 2000);
      } else if (prevPhase.current === 2 && phase === 1) {
        setPhaseMessage(`Round ${(gameData?.round_number ?? 0) + 1}`);
      }
    }
    prevPhase.current = phase;
  }, [phase, gameData?.round_number]);

  useEffect(() => {
    if (phaseMessage) {
      const t = setTimeout(() => setPhaseMessage(null), 1500);
      return () => clearTimeout(t);
    }
  }, [phaseMessage]);

  // Polling
  const pollGame = useCallback(async () => {
    try {
      const data = await service.getGame(sessionId);
      if (data) {
        setGameData(data);
        setRoomExists(false);
        const ps = loadPrivateState(sessionId, userAddress);
        if (ps) setPrivateState(ps);
      } else {
        const room = await service.getRoom(sessionId);
        setRoomExists(!!room);
      }
    } catch {
      // ignore poll errors
    }
  }, [sessionId, userAddress]);

  useEffect(() => {
    pollGame();
    pollRef.current = setInterval(pollGame, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pollGame]);

  useEffect(() => {
    if (phase === 2) respondedRef.current = false;
  }, [phase, gameData?.round_number]);

  // Auto-respond when hit
  useEffect(() => {
    if (phase !== 2 || !privateState || !incomingShot || myResponded || respondedRef.current || autoResponding) return;
    const wasHit = deriveHitResult(privateState, incomingShot);
    if (wasHit) {
      respondedRef.current = true;
      setAutoResponding(true);
      (async () => {
        try {
          const signer = getContractSigner();
          await service.respond(sessionId, userAddress, true, privateState, privateState, signer);
          toast.warning('You were hit!');
          await pollGame();
        } catch (e: any) {
          toast.error(parseContractError(e.message || 'Failed to respond'));
        } finally {
          setAutoResponding(false);
        }
      })();
    }
  }, [phase, privateState, incomingShot, myResponded, autoResponding, gameData?.round_number]);

  // Save game result when finished
  useEffect(() => {
    if (phase !== 3 || !gameData || savedResult.current) return;
    savedResult.current = true;
    const opponent = isPlayer1 ? gameData.player2 : gameData.player1;
    const result = gameData.is_draw ? 'draw' : gameData.winner === userAddress ? 'win' : 'loss';
    const stake = Number(gameData.player1_points) / 10_000_000;
    saveGameResult(userAddress, {
      sessionId,
      opponent,
      result,
      stake,
      date: new Date().toISOString(),
      rounds: gameData.round_number + 1,
    });
  }, [phase, gameData, isPlayer1, userAddress, sessionId]);

  // ======== ACTIONS ========

  const ensureTerms = (action: () => void) => {
    if (termsAccepted) { action(); return; }
    setShowTerms(true);
  };

  const handleAcceptTerms = () => {
    sessionStorage.setItem(termsKey, '1');
    setTermsAccepted(true);
    setShowTerms(false);
  };

  const handleCommitPosition = async () => {
    if (!selectedCell) { toast.error('Select your starting position'); return; }
    ensureTerms(async () => {
      setLoading(true);
      try {
        const salt = generateSalt();
        const ps: PrivateState = { x: selectedCell.x, y: selectedCell.y, salt };
        savePrivateState(sessionId, userAddress, ps);
        setPrivateState(ps);
        const signer = getContractSigner();
        await service.commitPosition(sessionId, userAddress, ps, signer);
        toast.success('Position committed!');
        setSelectedCell(null);
        await pollGame();
      } catch (e: any) {
        toast.error(parseContractError(e.message || 'Failed to commit'));
      } finally {
        setLoading(false);
      }
    });
  };

  const handleFire = async () => {
    if (!selectedCell) { toast.error('Select a target cell'); return; }
    setLoading(true);
    try {
      const signer = getContractSigner();
      await service.fire(sessionId, userAddress, selectedCell.x, selectedCell.y, signer);
      setShotHistory((prev) => [...prev, { pos: selectedCell, hit: false }]);
      toast.success(`Fired at ${String.fromCharCode(65 + selectedCell.x)}${selectedCell.y + 1}!`);
      setSelectedCell(null);
      await pollGame();
    } catch (e: any) {
      toast.error(parseContractError(e.message || 'Failed to fire'));
    } finally {
      setLoading(false);
    }
  };

  const handleMoveAndRespond = async () => {
    if (!selectedCell || !privateState) { toast.error('Select a cell to move to'); return; }
    setLoading(true);
    respondedRef.current = true;
    try {
      const wasHit = incomingShot ? deriveHitResult(privateState, incomingShot) : false;
      const newSalt = generateSalt();
      const newState: PrivateState = { x: selectedCell.x, y: selectedCell.y, salt: newSalt };
      const signer = getContractSigner();
      await service.respond(sessionId, userAddress, wasHit, privateState, newState, signer);
      savePrivateState(sessionId, userAddress, newState);
      setPrivateState(newState);
      toast.success(wasHit ? 'Hit! Responded.' : 'Moved to new position.');
      setSelectedCell(null);
      await pollGame();
    } catch (e: any) {
      toast.error(parseContractError(e.message || 'Failed to respond'));
      respondedRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  const handleClaimTimeout = async () => {
    setLoading(true);
    try {
      const signer = getContractSigner();
      await service.claimTimeout(sessionId, userAddress, signer);
      toast.success('Timeout claimed!');
      await pollGame();
    } catch (e: any) {
      toast.error(parseContractError(e.message || 'Cannot claim timeout yet'));
    } finally {
      setLoading(false);
    }
  };

  const handleRematch = async () => {
    setLoading(true);
    try {
      const newSid = createSessionId();
      const newPassword = generateRoomPassword();
      const pwHash = hashPassword(newPassword);
      const stake = gameData?.player1_points ?? BigInt(500_000_000);
      const signer = getContractSigner();
      await service.createRoom(newSid, userAddress, BigInt(stake), false, pwHash, signer);
      navigate(`/room/${newSid}`, { state: { stake: Number(stake) / 10_000_000, password: newPassword, isPublic: false } });
    } catch (e: any) {
      toast.error(parseContractError(e.message || 'Failed to create rematch'));
    } finally {
      setLoading(false);
    }
  };

  const stakeDisplay = gameData
    ? (Number(gameData.player1_points) / 10_000_000).toFixed(0)
    : locState.stake?.toString() ?? '?';

  // ======== Determine GameBoard props for phases 1-3 (always dual view) ========

  // Which half is disabled?
  let disabledHalf: 'enemy' | 'ally' | null = null;
  let boardMode: 'fire' | 'move' | 'view' = 'view';
  let disabledOverlay: React.ReactNode = null;

  if (phase === 1) {
    boardMode = 'fire';
    if (myHasShot) {
      // We fired, waiting for opponent — dim the ally (bottom), show waiting on ally
      disabledHalf = 'ally';
      disabledOverlay = (
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-primary mb-1" size={16} />
          <p className="text-[10px] text-muted-foreground">Waiting for opponent...</p>
        </div>
      );
    } else {
      // We need to fire — dim ally so focus is on enemy grid
      disabledHalf = 'ally';
    }
  } else if (phase === 2) {
    if (autoResponding) {
      boardMode = 'view';
      disabledHalf = 'ally';
      disabledOverlay = (
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-red-400 mb-1" size={16} />
          <p className="text-[10px] font-bold text-red-400">You were hit!</p>
          <p className="text-[9px] text-muted-foreground">Auto-responding...</p>
        </div>
      );
    } else if (!myResponded && wasHitByOpponent === false) {
      // Need to move — dim enemy, interact with ally
      boardMode = 'move';
      disabledHalf = 'enemy';
    } else if (myResponded) {
      boardMode = 'view';
      disabledHalf = 'enemy';
      disabledOverlay = (
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-primary mb-1" size={16} />
          <p className="text-[10px] text-muted-foreground">Waiting for opponent...</p>
        </div>
      );
    } else {
      boardMode = 'view';
    }
  } else if (phase === 3) {
    boardMode = 'view';
  }

  // ======== RENDER ========

  return (
    <>
      {/* Terms Dialog */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-yellow-400" />
              Before You Play
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>Your stake of <strong className="text-foreground">{stakeDisplay} XLM</strong> will be locked in the smart contract.</p>
                <p>You must complete each action within <strong className="text-foreground">3 minutes</strong>.</p>
                <p>If you fail to act in time, your opponent can claim your entire stake.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <Button className="w-full mt-2" onClick={handleAcceptTerms}>
            I Understand — Let's Play
          </Button>
        </DialogContent>
      </Dialog>

      {/* Phase transition overlay */}
      {phaseMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="text-2xl font-black text-primary animate-fade-in drop-shadow-[0_0_20px_oklch(0.715_0.143_215.221/0.5)]">
            {phaseMessage}
          </div>
        </div>
      )}

      {/* Main game container — exact viewport fit, no scroll */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ height: GAME_H }}
      >
        {/* ============ PRE-GAME STATES ============ */}

        {/* WAITING FOR OPPONENT */}
        {roomExists && !gameData && (
          <WaitingRoom
            sessionId={sessionId}
            stake={String(locState.stake ?? '?')}
            isPublic={locState.isPublic ?? true}
            password={locState.password ?? ''}
          />
        )}

        {/* LOADING */}
        {roomExists === null && !gameData && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <Loader2 className="mx-auto animate-spin text-primary" size={24} />
              <p className="text-xs text-muted-foreground">Loading room...</p>
            </div>
          </div>
        )}

        {/* NOT FOUND */}
        {roomExists === false && !gameData && (
          <div className="flex-1 flex items-center justify-center">
            <Card>
              <CardContent className="p-6 text-center space-y-2">
                <p className="text-sm font-medium">Room not found</p>
                <p className="text-xs text-muted-foreground">This room may have expired or been cancelled.</p>
                <Button variant="outline" onClick={() => navigate('/play')}>Back to Play</Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============ SETUP PHASE — single grid ============ */}
        {gameData && phase === 0 && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Status bar */}
            <div className="shrink-0 flex items-center justify-between py-1">
              <span className="text-[10px] text-muted-foreground font-mono">#{sessionId}</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">Setup</Badge>
                <CountdownTimer lastActionLedger={gameData.last_action_ledger} timeoutLedgers={SETUP_TIMEOUT_LEDGERS} />
              </div>
            </div>

            {!myCommitted ? (
              <div className="flex flex-col flex-1 min-h-0">
                <p className="text-[10px] text-center text-muted-foreground mb-1 shrink-0">
                  Tap a cell to choose your starting position
                </p>
                <div className="flex-1 min-h-0 flex items-center">
                  <div className="w-full">
                    <GameBoard
                      myPosition={selectedCell}
                      blockedCells={[]}
                      onCellClick={(x, y) => setSelectedCell({ x, y })}
                      selectedCell={selectedCell}
                      mode="select-position"
                      combined
                      compact
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <p className="text-sm font-medium text-green-500">Position committed!</p>
                  <p className="text-xs text-muted-foreground">Waiting for opponent to commit...</p>
                  <Loader2 className="mx-auto animate-spin text-primary mt-3" size={20} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ PHASES 1-3 — ALWAYS DUAL VIEW ============ */}
        {gameData && phase >= 1 && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Status bar */}
            <div className="shrink-0 flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-mono">#{sessionId}</span>
                {phase < 3 && (
                  <Badge variant="outline" className="text-[10px]">R{(gameData.round_number ?? 0) + 1}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {phase === 1 && (
                  <Badge variant={myHasShot ? 'secondary' : 'default'} className="text-[10px]">
                    {myHasShot ? 'Waiting...' : 'Fire!'}
                  </Badge>
                )}
                {phase === 2 && (
                  <>
                    {myShot && !showMissiles && (
                      <div className="flex gap-1">
                        <span className={`text-[9px] font-bold ${myLastShotHit ? 'text-red-400' : 'text-muted-foreground'}`}>
                          {myLastShotHit ? 'HIT!' : 'MISS'}
                        </span>
                        <span className="text-[9px] text-muted-foreground">/</span>
                        <span className={`text-[9px] font-bold ${wasHitByOpponent ? 'text-red-400' : 'text-green-400'}`}>
                          {wasHitByOpponent ? 'HIT' : 'SAFE'}
                        </span>
                      </div>
                    )}
                    <Badge variant="secondary" className="text-[10px]">Resolving</Badge>
                  </>
                )}
                {phase === 3 && (
                  <Badge
                    variant={gameData.is_draw ? 'secondary' : gameData.winner === userAddress ? 'default' : 'destructive'}
                    className="text-[10px]"
                  >
                    {gameData.is_draw ? 'Draw' : gameData.winner === userAddress ? 'Victory' : 'Defeat'}
                  </Badge>
                )}
                {phase < 3 && (
                  <CountdownTimer
                    lastActionLedger={gameData.last_action_ledger}
                    timeoutLedgers={phase === 0 ? SETUP_TIMEOUT_LEDGERS : ACTION_TIMEOUT_LEDGERS}
                  />
                )}
              </div>
            </div>

            {/* Finished result overlay above grids */}
            {phase === 3 && (
              <div className="shrink-0 py-2 text-center">
                {gameData.is_draw ? (
                  <div className="flex items-center justify-center gap-2">
                    <Equal size={20} className="text-primary" />
                    <h2 className="text-base font-black text-primary">DRAW</h2>
                    <span className="text-[10px] text-muted-foreground">— Stakes refunded</span>
                  </div>
                ) : gameData.winner === userAddress ? (
                  <div className="flex items-center justify-center gap-2">
                    <Trophy size={20} className="text-primary drop-shadow-[0_0_8px_oklch(0.715_0.143_215.221/0.5)]" />
                    <h2 className="text-base font-black text-primary">YOU WIN!</h2>
                    <span className="text-[10px] text-muted-foreground">
                      +{((Number(gameData.player1_points) + Number(gameData.player2_points)) * 0.9 / 10_000_000).toFixed(1)} XLM
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <Skull size={20} className="text-destructive" />
                    <h2 className="text-base font-black text-destructive">DEFEATED</h2>
                  </div>
                )}
              </div>
            )}

            {/* Dual grid — always visible, fills remaining space */}
            <div className="flex-1 min-h-0 relative">
              <div className="h-full">
                <GameBoard
                  myPosition={privateState ? { x: privateState.x, y: privateState.y } : null}
                  blockedCells={blockedCells}
                  onCellClick={(x, y) => {
                    if (loading) return;
                    if (boardMode === 'move') {
                      if (moveTargets.some((t) => t.x === x && t.y === y)) {
                        setSelectedCell({ x, y });
                      }
                    } else {
                      setSelectedCell({ x, y });
                    }
                  }}
                  selectedCell={selectedCell}
                  mode={boardMode}
                  shotHistory={shotHistory}
                  moveTargets={moveTargets}
                  incomingShot={incomingShot}
                  incomingShotHit={wasHitByOpponent ?? undefined}
                  showMissileAnimation={showMissiles}
                  compact
                  disabledHalf={disabledHalf}
                  disabledOverlay={disabledOverlay}
                />
              </div>

              {/* Side controls — timeout */}
              <SideControls onClaimTimeout={handleClaimTimeout} showTimeout={showTimeoutControl} />
            </div>
          </div>
        )}
      </div>

      {/* Floating action button — above BottomNav */}
      <FloatingAction visible={!!shouldShowAction}>
        {phase === 0 && !myCommitted && (
          <Button className="w-full h-12 text-sm font-bold" onClick={handleCommitPosition} disabled={loading || !selectedCell}>
            {loading ? <><Loader2 className="animate-spin mr-2" size={16} /> Committing...</> : 'Commit Position'}
          </Button>
        )}
        {phase === 1 && !myHasShot && (
          <Button variant="destructive" className="w-full h-12 text-sm font-bold" onClick={handleFire} disabled={loading || !selectedCell}>
            {loading ? 'Firing...' : selectedCell
              ? `Fire at ${String.fromCharCode(65 + selectedCell.x)}${selectedCell.y + 1}`
              : 'Select target to fire'}
          </Button>
        )}
        {phase === 2 && !myResponded && !autoResponding && wasHitByOpponent === false && (
          <Button className="w-full h-12 text-sm font-bold" onClick={handleMoveAndRespond} disabled={loading || !selectedCell}>
            {loading ? 'Moving...' : selectedCell
              ? `Move to ${String.fromCharCode(65 + selectedCell.x)}${selectedCell.y + 1}`
              : 'Select a cell to move'}
          </Button>
        )}
        {phase === 3 && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12 font-bold" onClick={() => navigate('/play')}>Exit</Button>
            <Button className="h-12 font-bold" onClick={handleRematch} disabled={loading}>
              {loading ? 'Creating...' : 'Rematch'}
            </Button>
          </div>
        )}
      </FloatingAction>
    </>
  );
}
