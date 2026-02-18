import { Client as ZeroTraceClient } from './bindings';
import { NETWORK_PASSPHRASE, RPC_URL } from '@/utils/constants';
import { contract } from '@stellar/stellar-sdk';
import { signAndSendViaLaunchtube } from '@/utils/transactionHelper';
import type { PrivateState, PendingRoom } from './types';

type ClientOptions = contract.ClientOptions;
type Signer = Pick<ClientOptions, 'signTransaction' | 'signAuthEntry'>;

export class ZeroTraceService {
  private baseClient: ZeroTraceClient;
  private contractId: string;

  constructor(contractId: string) {
    this.contractId = contractId;
    this.baseClient = new ZeroTraceClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
    });
  }

  private createSigningClient(publicKey: string, signer: Signer): ZeroTraceClient {
    return new ZeroTraceClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey,
      ...signer,
    });
  }

  // ======== ROOM SYSTEM ========

  async createRoom(
    sessionId: number,
    creator: string,
    stake: bigint,
    isPublic: boolean,
    passwordHash: Uint8Array,
    signer: Signer,
  ): Promise<void> {
    console.log('[createRoom] sessionId:', sessionId, 'creator:', creator.slice(0, 8), 'public:', isPublic);
    const client = this.createSigningClient(creator, signer);
    const tx = await client.create_room({
      session_id: sessionId,
      creator,
      stake,
      is_public: isPublic,
      password_hash: Buffer.from(passwordHash),
    });
    await signAndSendViaLaunchtube(tx);
    console.log('[createRoom] success');
  }

  async joinRoom(
    sessionId: number,
    joiner: string,
    password: Uint8Array,
    signer: Signer,
  ): Promise<void> {
    console.log('[joinRoom] sessionId:', sessionId, 'joiner:', joiner.slice(0, 8));
    const client = this.createSigningClient(joiner, signer);
    const tx = await client.join_room({
      session_id: sessionId,
      joiner,
      password: Buffer.from(password),
    });
    await signAndSendViaLaunchtube(tx);
    console.log('[joinRoom] success');
  }

  async getRoom(sessionId: number): Promise<PendingRoom | null> {
    try {
      const tx = await this.baseClient.get_room({ session_id: sessionId });
      const result = await tx.simulate();
      if (result.result.isOk()) {
        return result.result.unwrap() as unknown as PendingRoom;
      }
      return null;
    } catch {
      return null;
    }
  }

  async listPublicRooms(): Promise<number[]> {
    try {
      const tx = await this.baseClient.list_public_rooms();
      const result = await tx.simulate();
      return result.result as unknown as number[];
    } catch {
      return [];
    }
  }

  async cancelRoom(
    sessionId: number,
    creator: string,
    signer: Signer,
  ): Promise<void> {
    console.log('[cancelRoom] sessionId:', sessionId);
    const client = this.createSigningClient(creator, signer);
    const tx = await client.cancel_room({
      session_id: sessionId,
      creator,
    });
    await signAndSendViaLaunchtube(tx);
    console.log('[cancelRoom] success');
  }

  // ======== ACTIVE GAME ========

  async getActiveGame(player: string): Promise<number | null> {
    try {
      const tx = await this.baseClient.get_active_game({ player });
      const result = await tx.simulate();
      if (result.result !== undefined && result.result !== null) {
        return result.result as unknown as number | null;
      }
      return null;
    } catch {
      return null;
    }
  }

  // ======== GAME OPERATIONS ========

  async getGame(sessionId: number): Promise<any | null> {
    try {
      const tx = await this.baseClient.get_game({ session_id: sessionId });
      const result = await tx.simulate();
      if (result.result.isOk()) {
        return result.result.unwrap();
      }
      return null;
    } catch {
      return null;
    }
  }

  async createGame(
    sessionId: number,
    player1: string,
    player2: string,
    player1Points: bigint,
    player2Points: bigint,
    signer: Signer,
  ): Promise<void> {
    console.log('[createGame] sessionId:', sessionId, 'p1:', player1.slice(0, 8), 'p2:', player2.slice(0, 8));
    const client = this.createSigningClient(player1, signer);
    const tx = await client.create_game({
      session_id: sessionId,
      player1,
      player2,
      player1_points: player1Points,
      player2_points: player2Points,
    });
    await signAndSendViaLaunchtube(tx);
    console.log('[createGame] success');
  }

  async commitPosition(
    sessionId: number,
    player: string,
    state: PrivateState,
    signer: Signer,
  ): Promise<void> {
    console.log('[commitPosition] player:', player.slice(0, 8), 'pos:', state.x, state.y);

    const commitmentBytes = new Uint8Array(32);
    commitmentBytes[0] = state.x;
    commitmentBytes[1] = state.y;
    const saltBytes = new TextEncoder().encode(state.salt.slice(0, 30));
    commitmentBytes.set(saltBytes.slice(0, 30), 2);

    // Pack dummy proof_blob: [4-byte count=1][32-byte public_input][32-byte proof]
    const proofBlob = new Uint8Array(4 + 32 + 32);
    const view = new DataView(proofBlob.buffer);
    view.setUint32(0, 1, false); // 1 public input, big-endian
    proofBlob[4] = 1; // dummy public input
    proofBlob[36] = 1; // dummy proof

    const client = this.createSigningClient(player, signer);
    const tx = await client.commit_position({
      session_id: sessionId,
      player,
      commitment: Buffer.from(commitmentBytes),
      proof: Buffer.from(proofBlob),
      public_inputs: Buffer.from(new Uint8Array(32)),
    });
    await signAndSendViaLaunchtube(tx);
    console.log('[commitPosition] success');
  }

  async fire(
    sessionId: number,
    player: string,
    targetX: number,
    targetY: number,
    signer: Signer,
  ): Promise<void> {
    console.log('[fire] player:', player.slice(0, 8), 'target:', targetX, targetY);
    const client = this.createSigningClient(player, signer);
    const tx = await client.fire({
      session_id: sessionId,
      player,
      target_x: targetX,
      target_y: targetY,
    });
    await signAndSendViaLaunchtube(tx);
    console.log('[fire] success');
  }

  async respond(
    sessionId: number,
    player: string,
    hit: boolean,
    oldState: PrivateState,
    newState: PrivateState,
    signer: Signer,
  ): Promise<void> {
    console.log('[respond] player:', player.slice(0, 8), 'hit:', hit, 'newPos:', newState.x, newState.y);

    const newCommitmentBytes = new Uint8Array(32);
    newCommitmentBytes[0] = newState.x;
    newCommitmentBytes[1] = newState.y;
    const saltBytes = new TextEncoder().encode(newState.salt.slice(0, 30));
    newCommitmentBytes.set(saltBytes.slice(0, 30), 2);

    const dummyProof = new Uint8Array(32);
    dummyProof[0] = 1;

    const client = this.createSigningClient(player, signer);
    const tx = await client.respond({
      session_id: sessionId,
      player,
      was_hit: hit,
      new_commitment: Buffer.from(newCommitmentBytes),
      shot_proof: Buffer.from(dummyProof),
      shot_public_inputs: Buffer.from(dummyProof),
      move_proof: Buffer.from(dummyProof),
      move_public_inputs: Buffer.from(dummyProof),
    });
    await signAndSendViaLaunchtube(tx);
    console.log('[respond] success');
  }

  async claimTimeout(
    sessionId: number,
    player: string,
    signer: Signer,
  ): Promise<void> {
    console.log('[claimTimeout] player:', player.slice(0, 8));
    const client = this.createSigningClient(player, signer);
    const tx = await client.claim_timeout({
      session_id: sessionId,
      player,
    });
    await signAndSendViaLaunchtube(tx);
    console.log('[claimTimeout] success');
  }
}
