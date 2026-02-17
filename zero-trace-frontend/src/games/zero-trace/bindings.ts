import { Buffer } from "buffer";
import { Address } from '@stellar/stellar-sdk';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  AssembledTransactionOptions,
  Option,
  Typepoint,
  Duration,
} from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk'
export * as contract from '@stellar/stellar-sdk/contract'
export * as rpc from '@stellar/stellar-sdk/rpc'

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDVQ2FXNQKVUFOFFY7W4DSVE7GXIDZKCQR2XULJUYD2ANOWU7BF6EXH5",
  }
} as const


export interface Game {
  blocked_x: Array<u32>;
  blocked_y: Array<u32>;
  current_turn: u32;
  has_last_shot: boolean;
  last_action_ledger: u32;
  last_shot_hit: u32;
  last_shot_x: u32;
  last_shot_y: u32;
  pending_equalizer: boolean;
  phase: GamePhase;
  player1: string;
  player1_alive: boolean;
  player1_commitment: Buffer;
  player1_committed: boolean;
  player1_points: i128;
  player2: string;
  player2_alive: boolean;
  player2_commitment: Buffer;
  player2_committed: boolean;
  player2_points: i128;
  turn_number: u32;
  winner: Option<string>;
}

export const Errors = {
  1: {message:"GameNotFound"},
  2: {message:"NotPlayer"},
  3: {message:"GameAlreadyEnded"},
  4: {message:"NotYourTurn"},
  5: {message:"InvalidPhase"},
  6: {message:"AlreadyCommitted"},
  7: {message:"InvalidProof"},
  8: {message:"CellBlocked"},
  9: {message:"TimedOut"},
  10: {message:"SelfPlay"},
  11: {message:"InvalidCoordinate"},
  12: {message:"WaitingForResponse"},
  13: {message:"NoShotToRespond"},
  14: {message:"RoomNotFound"},
  15: {message:"RoomAlreadyExists"},
  16: {message:"WrongPassword"},
  17: {message:"NotCreator"}
}

export type DataKey = {tag: "Game", values: readonly [u32]} | {tag: "PendingRoom", values: readonly [u32]} | {tag: "PublicRoomIndex", values: void} | {tag: "GameHubAddress", values: void} | {tag: "Admin", values: void} | {tag: "VerifierAddress", values: void} | {tag: "PositionVk", values: void} | {tag: "ShotVk", values: void} | {tag: "MoveVk", values: void};

export enum GamePhase {
  Setup = 0,
  Playing = 1,
  WaitingResponse = 2,
  Finished = 3,
}


export interface PendingRoom {
  created_ledger: u32;
  creator: string;
  is_public: boolean;
  password_hash: Buffer;
  stake: i128;
}

export interface Client {
  /**
   * Construct and simulate a fire transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fire a shot at a target cell. Only the active player can fire.
   */
  fire: ({session_id, player, target_x, target_y}: {session_id: u32, player: string, target_x: u32, target_y: u32}, options?: AssembledTransactionOptions<Result<void>>) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_vk transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Store a verification key for a circuit type.
   * circuit_type: 0 = position, 1 = shot, 2 = move
   */
  set_vk: ({circuit_type, vk}: {circuit_type: u32, vk: Buffer}, options?: AssembledTransactionOptions<null>) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_hub: (options?: AssembledTransactionOptions<string>) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a respond transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Target player responds to a shot: proves hit/miss AND moves to new position.
   */
  respond: ({session_id, player, hit, new_commitment, shot_proof, shot_public_inputs, move_proof, move_public_inputs}: {session_id: u32, player: string, hit: boolean, new_commitment: Buffer, shot_proof: Buffer, shot_public_inputs: Buffer, move_proof: Buffer, move_public_inputs: Buffer}, options?: AssembledTransactionOptions<Result<void>>) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_hub: ({new_hub}: {new_hub: string}, options?: AssembledTransactionOptions<null>) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: AssembledTransactionOptions<null>) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read game state.
   */
  get_game: ({session_id}: {session_id: u32}, options?: AssembledTransactionOptions<Result<Game>>) => Promise<AssembledTransaction<Result<Game>>>

  /**
   * Construct and simulate a get_room transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read a pending room (no auth required).
   */
  get_room: ({session_id}: {session_id: u32}, options?: AssembledTransactionOptions<Result<PendingRoom>>) => Promise<AssembledTransaction<Result<PendingRoom>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_admin: (options?: AssembledTransactionOptions<string>) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a join_room transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Join a pending room. Verifies password for private rooms.
   * Creates the full Game and calls Game Hub start_game.
   */
  join_room: ({session_id, joiner, password}: {session_id: u32, joiner: string, password: Buffer}, options?: AssembledTransactionOptions<Result<void>>) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: AssembledTransactionOptions<null>) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a cancel_room transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel a pending room. Only the creator can cancel.
   */
  cancel_room: ({session_id, creator}: {session_id: u32, creator: string}, options?: AssembledTransactionOptions<Result<void>>) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create a new game session. Both players must authorize their stakes.
   */
  create_game: ({session_id, player1, player2, player1_points, player2_points}: {session_id: u32, player1: string, player2: string, player1_points: i128, player2_points: i128}, options?: AssembledTransactionOptions<Result<void>>) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_room transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create a pending room. Only the creator signs.
   */
  create_room: ({session_id, creator, stake, is_public, password_hash}: {session_id: u32, creator: string, stake: i128, is_public: boolean, password_hash: Buffer}, options?: AssembledTransactionOptions<Result<void>>) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_verifier: (options?: AssembledTransactionOptions<string>) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_verifier: ({new_verifier}: {new_verifier: string}, options?: AssembledTransactionOptions<null>) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a claim_timeout transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Claim victory by timeout. If opponent hasn't acted in ~2 minutes, caller wins.
   */
  claim_timeout: ({session_id, player}: {session_id: u32, player: string}, options?: AssembledTransactionOptions<Result<string>>) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a commit_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Commit initial position with ZK proof.
   */
  commit_position: ({session_id, player, commitment, proof, public_inputs}: {session_id: u32, player: string, commitment: Buffer, proof: Buffer, public_inputs: Buffer}, options?: AssembledTransactionOptions<Result<void>>) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a list_public_rooms transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * List active public room IDs. Prunes expired rooms.
   */
  list_public_rooms: (options?: AssembledTransactionOptions<Array<u32>>) => Promise<AssembledTransaction<Array<u32>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, game_hub, verifier}: {admin: string, game_hub: string, verifier: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, game_hub, verifier}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "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",
        "AAAAAAAAAAAAAAAHZ2V0X2h1YgAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAExUYXJnZXQgcGxheWVyIHJlc3BvbmRzIHRvIGEgc2hvdDogcHJvdmVzIGhpdC9taXNzIEFORCBtb3ZlcyB0byBuZXcgcG9zaXRpb24uAAAAB3Jlc3BvbmQAAAAACAAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAANoaXQAAAAAAQAAAAAAAAAObmV3X2NvbW1pdG1lbnQAAAAAA+4AAAAgAAAAAAAAAApzaG90X3Byb29mAAAAAAAOAAAAAAAAABJzaG90X3B1YmxpY19pbnB1dHMAAAAAAA4AAAAAAAAACm1vdmVfcHJvb2YAAAAAAA4AAAAAAAAAEm1vdmVfcHVibGljX2lucHV0cwAAAAAADgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAHc2V0X2h1YgAAAAABAAAAAAAAAAduZXdfaHViAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAABBSZWFkIGdhbWUgc3RhdGUuAAAACGdldF9nYW1lAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAPpAAAH0AAAAARHYW1lAAAAAw==",
        "AAAAAAAAACdSZWFkIGEgcGVuZGluZyByb29tIChubyBhdXRoIHJlcXVpcmVkKS4AAAAACGdldF9yb29tAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAPpAAAH0AAAAAtQZW5kaW5nUm9vbQAAAAAD",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAG5Kb2luIGEgcGVuZGluZyByb29tLiBWZXJpZmllcyBwYXNzd29yZCBmb3IgcHJpdmF0ZSByb29tcy4KQ3JlYXRlcyB0aGUgZnVsbCBHYW1lIGFuZCBjYWxscyBHYW1lIEh1YiBzdGFydF9nYW1lLgAAAAAACWpvaW5fcm9vbQAAAAAAAAMAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABmpvaW5lcgAAAAAAEwAAAAAAAAAIcGFzc3dvcmQAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAADNDYW5jZWwgYSBwZW5kaW5nIHJvb20uIE9ubHkgdGhlIGNyZWF0b3IgY2FuIGNhbmNlbC4AAAAAC2NhbmNlbF9yb29tAAAAAAIAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAERDcmVhdGUgYSBuZXcgZ2FtZSBzZXNzaW9uLiBCb3RoIHBsYXllcnMgbXVzdCBhdXRob3JpemUgdGhlaXIgc3Rha2VzLgAAAAtjcmVhdGVfZ2FtZQAAAAAFAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAAB3BsYXllcjIAAAAAEwAAAAAAAAAOcGxheWVyMV9wb2ludHMAAAAAAAsAAAAAAAAADnBsYXllcjJfcG9pbnRzAAAAAAALAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAC5DcmVhdGUgYSBwZW5kaW5nIHJvb20uIE9ubHkgdGhlIGNyZWF0b3Igc2lnbnMuAAAAAAALY3JlYXRlX3Jvb20AAAAABQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAVzdGFrZQAAAAAAAAsAAAAAAAAACWlzX3B1YmxpYwAAAAAAAAEAAAAAAAAADXBhc3N3b3JkX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAMZ2V0X3ZlcmlmaWVyAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAMc2V0X3ZlcmlmaWVyAAAAAQAAAAAAAAAMbmV3X3ZlcmlmaWVyAAAAEwAAAAA=",
        "AAAAAAAAADtJbml0aWFsaXplIHdpdGggYWRtaW4sIGdhbWUgaHViLCBhbmQgWksgdmVyaWZpZXIgYWRkcmVzc2VzLgAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIZ2FtZV9odWIAAAATAAAAAAAAAAh2ZXJpZmllcgAAABMAAAAA",
        "AAAAAAAAAE5DbGFpbSB2aWN0b3J5IGJ5IHRpbWVvdXQuIElmIG9wcG9uZW50IGhhc24ndCBhY3RlZCBpbiB+MiBtaW51dGVzLCBjYWxsZXIgd2lucy4AAAAAAA1jbGFpbV90aW1lb3V0AAAAAAAAAgAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAA+kAAAATAAAAAw==",
        "AAAAAAAAACZDb21taXQgaW5pdGlhbCBwb3NpdGlvbiB3aXRoIFpLIHByb29mLgAAAAAAD2NvbW1pdF9wb3NpdGlvbgAAAAAFAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAACmNvbW1pdG1lbnQAAAAAA+4AAAAgAAAAAAAAAAVwcm9vZgAAAAAAAA4AAAAAAAAADXB1YmxpY19pbnB1dHMAAAAAAAAOAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAADJMaXN0IGFjdGl2ZSBwdWJsaWMgcm9vbSBJRHMuIFBydW5lcyBleHBpcmVkIHJvb21zLgAAAAAAEWxpc3RfcHVibGljX3Jvb21zAAAAAAAAAAAAAAEAAAPqAAAABA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    fire: this.txFromJSON<Result<void>>,
        set_vk: this.txFromJSON<null>,
        get_hub: this.txFromJSON<string>,
        respond: this.txFromJSON<Result<void>>,
        set_hub: this.txFromJSON<null>,
        upgrade: this.txFromJSON<null>,
        get_game: this.txFromJSON<Result<Game>>,
        get_room: this.txFromJSON<Result<PendingRoom>>,
        get_admin: this.txFromJSON<string>,
        join_room: this.txFromJSON<Result<void>>,
        set_admin: this.txFromJSON<null>,
        cancel_room: this.txFromJSON<Result<void>>,
        create_game: this.txFromJSON<Result<void>>,
        create_room: this.txFromJSON<Result<void>>,
        get_verifier: this.txFromJSON<string>,
        set_verifier: this.txFromJSON<null>,
        claim_timeout: this.txFromJSON<Result<string>>,
        commit_position: this.txFromJSON<Result<void>>,
        list_public_rooms: this.txFromJSON<Array<u32>>
  }
}