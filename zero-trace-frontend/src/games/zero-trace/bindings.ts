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
    contractId: "CCS46JZ44VU56G2SDIKBYAD5THJ5MCGT2OY7N3KTFHINU2MFMAOWYJBA",
  }
} as const


export interface Game {
  blocked_x: Array<u32>;
  blocked_y: Array<u32>;
  is_draw: boolean;
  last_action_ledger: u32;
  phase: GamePhase;
  player1: string;
  player1_commitment: Buffer;
  player1_committed: boolean;
  player1_has_shot: boolean;
  player1_points: i128;
  player1_responded: boolean;
  player1_shot_x: u32;
  player1_shot_y: u32;
  player1_was_hit: boolean;
  player2: string;
  player2_commitment: Buffer;
  player2_committed: boolean;
  player2_has_shot: boolean;
  player2_points: i128;
  player2_responded: boolean;
  player2_shot_x: u32;
  player2_shot_y: u32;
  player2_was_hit: boolean;
  round_number: u32;
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
  17: {message:"NotCreator"},
  18: {message:"AlreadyFired"},
  19: {message:"AlreadyResponded"},
  20: {message:"AlreadyInGame"}
}

export type DataKey = {tag: "Game", values: readonly [u32]} | {tag: "PendingRoom", values: readonly [u32]} | {tag: "PublicRoomIndex", values: void} | {tag: "GameHubAddress", values: void} | {tag: "Admin", values: void} | {tag: "VerifierAddress", values: void} | {tag: "NativeToken", values: void} | {tag: "PositionVk", values: void} | {tag: "ShotVk", values: void} | {tag: "MoveVk", values: void} | {tag: "ActiveGame", values: readonly [string]};

export enum GamePhase {
  Setup = 0,
  Firing = 1,
  Responding = 2,
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
   * Fire a shot. Both players fire independently during Firing phase.
   * When both have fired, transitions to Responding.
   */
  fire: ({session_id, player, target_x, target_y}: {session_id: u32, player: string, target_x: u32, target_y: u32}, options?: AssembledTransactionOptions<Result<void>>) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_vk transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_vk: ({circuit_type, vk}: {circuit_type: u32, vk: Buffer}, options?: AssembledTransactionOptions<null>) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_hub: (options?: AssembledTransactionOptions<string>) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a respond transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Respond to the round: prove hit/miss and submit new position.
   * Both players call independently. When both respond, round resolves.
   */
  respond: ({session_id, player, was_hit, new_commitment, shot_proof, shot_public_inputs, move_proof, move_public_inputs}: {session_id: u32, player: string, was_hit: boolean, new_commitment: Buffer, shot_proof: Buffer, shot_public_inputs: Buffer, move_proof: Buffer, move_public_inputs: Buffer}, options?: AssembledTransactionOptions<Result<void>>) => Promise<AssembledTransaction<Result<void>>>

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
   */
  get_room: ({session_id}: {session_id: u32}, options?: AssembledTransactionOptions<Result<PendingRoom>>) => Promise<AssembledTransaction<Result<PendingRoom>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_admin: (options?: AssembledTransactionOptions<string>) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a join_room transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  join_room: ({session_id, joiner, password}: {session_id: u32, joiner: string, password: Buffer}, options?: AssembledTransactionOptions<Result<void>>) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: AssembledTransactionOptions<null>) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a cancel_room transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel_room: ({session_id, creator}: {session_id: u32, creator: string}, options?: AssembledTransactionOptions<Result<void>>) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create a new game session directly (for tests / backward compat).
   */
  create_game: ({session_id, player1, player2, player1_points, player2_points}: {session_id: u32, player1: string, player2: string, player1_points: i128, player2_points: i128}, options?: AssembledTransactionOptions<Result<void>>) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_room transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
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
   * Claim timeout win. Phase-aware: caller must have acted, opponent must not have.
   */
  claim_timeout: ({session_id, player}: {session_id: u32, player: string}, options?: AssembledTransactionOptions<Result<string>>) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a commit_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Commit initial position with ZK proof. Both players call independently.
   */
  commit_position: ({session_id, player, commitment, proof, public_inputs}: {session_id: u32, player: string, commitment: Buffer, proof: Buffer, public_inputs: Buffer}, options?: AssembledTransactionOptions<Result<void>>) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_active_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get a player's active game session ID. Returns None if not in a game.
   */
  get_active_game: ({player}: {player: string}, options?: AssembledTransactionOptions<Option<u32>>) => Promise<AssembledTransaction<Option<u32>>>

  /**
   * Construct and simulate a list_public_rooms transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  list_public_rooms: (options?: AssembledTransactionOptions<Array<u32>>) => Promise<AssembledTransaction<Array<u32>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, game_hub, verifier, native_token}: {admin: string, game_hub: string, verifier: string, native_token: string},
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
    return ContractClient.deploy({admin, game_hub, verifier, native_token}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAABEdhbWUAAAAZAAAAAAAAAAlibG9ja2VkX3gAAAAAAAPqAAAABAAAAAAAAAAJYmxvY2tlZF95AAAAAAAD6gAAAAQAAAAAAAAAB2lzX2RyYXcAAAAAAQAAAAAAAAASbGFzdF9hY3Rpb25fbGVkZ2VyAAAAAAAEAAAAAAAAAAVwaGFzZQAAAAAAB9AAAAAJR2FtZVBoYXNlAAAAAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAAEnBsYXllcjFfY29tbWl0bWVudAAAAAAD7gAAACAAAAAAAAAAEXBsYXllcjFfY29tbWl0dGVkAAAAAAAAAQAAAAAAAAAQcGxheWVyMV9oYXNfc2hvdAAAAAEAAAAAAAAADnBsYXllcjFfcG9pbnRzAAAAAAALAAAAAAAAABFwbGF5ZXIxX3Jlc3BvbmRlZAAAAAAAAAEAAAAAAAAADnBsYXllcjFfc2hvdF94AAAAAAAEAAAAAAAAAA5wbGF5ZXIxX3Nob3RfeQAAAAAABAAAAAAAAAAPcGxheWVyMV93YXNfaGl0AAAAAAEAAAAAAAAAB3BsYXllcjIAAAAAEwAAAAAAAAAScGxheWVyMl9jb21taXRtZW50AAAAAAPuAAAAIAAAAAAAAAARcGxheWVyMl9jb21taXR0ZWQAAAAAAAABAAAAAAAAABBwbGF5ZXIyX2hhc19zaG90AAAAAQAAAAAAAAAOcGxheWVyMl9wb2ludHMAAAAAAAsAAAAAAAAAEXBsYXllcjJfcmVzcG9uZGVkAAAAAAAAAQAAAAAAAAAOcGxheWVyMl9zaG90X3gAAAAAAAQAAAAAAAAADnBsYXllcjJfc2hvdF95AAAAAAAEAAAAAAAAAA9wbGF5ZXIyX3dhc19oaXQAAAAAAQAAAAAAAAAMcm91bmRfbnVtYmVyAAAABAAAAAAAAAAGd2lubmVyAAAAAAPoAAAAEw==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAFAAAAAAAAAAMR2FtZU5vdEZvdW5kAAAAAQAAAAAAAAAJTm90UGxheWVyAAAAAAAAAgAAAAAAAAAQR2FtZUFscmVhZHlFbmRlZAAAAAMAAAAAAAAAC05vdFlvdXJUdXJuAAAAAAQAAAAAAAAADEludmFsaWRQaGFzZQAAAAUAAAAAAAAAEEFscmVhZHlDb21taXR0ZWQAAAAGAAAAAAAAAAxJbnZhbGlkUHJvb2YAAAAHAAAAAAAAAAtDZWxsQmxvY2tlZAAAAAAIAAAAAAAAAAhUaW1lZE91dAAAAAkAAAAAAAAACFNlbGZQbGF5AAAACgAAAAAAAAARSW52YWxpZENvb3JkaW5hdGUAAAAAAAALAAAAAAAAABJXYWl0aW5nRm9yUmVzcG9uc2UAAAAAAAwAAAAAAAAAD05vU2hvdFRvUmVzcG9uZAAAAAANAAAAAAAAAAxSb29tTm90Rm91bmQAAAAOAAAAAAAAABFSb29tQWxyZWFkeUV4aXN0cwAAAAAAAA8AAAAAAAAADVdyb25nUGFzc3dvcmQAAAAAAAAQAAAAAAAAAApOb3RDcmVhdG9yAAAAAAARAAAAAAAAAAxBbHJlYWR5RmlyZWQAAAASAAAAAAAAABBBbHJlYWR5UmVzcG9uZGVkAAAAEwAAAAAAAAANQWxyZWFkeUluR2FtZQAAAAAAABQ=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACwAAAAEAAAAAAAAABEdhbWUAAAABAAAABAAAAAEAAAAAAAAAC1BlbmRpbmdSb29tAAAAAAEAAAAEAAAAAAAAAAAAAAAPUHVibGljUm9vbUluZGV4AAAAAAAAAAAAAAAADkdhbWVIdWJBZGRyZXNzAAAAAAAAAAAAAAAAAAVBZG1pbgAAAAAAAAAAAAAAAAAAD1ZlcmlmaWVyQWRkcmVzcwAAAAAAAAAAAAAAAAtOYXRpdmVUb2tlbgAAAAAAAAAAAAAAAApQb3NpdGlvblZrAAAAAAAAAAAAAAAAAAZTaG90VmsAAAAAAAAAAAAAAAAABk1vdmVWawAAAAAAAQAAAAAAAAAKQWN0aXZlR2FtZQAAAAAAAQAAABM=",
        "AAAAAwAAAAAAAAAAAAAACUdhbWVQaGFzZQAAAAAAAAQAAAAAAAAABVNldHVwAAAAAAAAAAAAAAAAAAAGRmlyaW5nAAAAAAABAAAAAAAAAApSZXNwb25kaW5nAAAAAAACAAAAAAAAAAhGaW5pc2hlZAAAAAM=",
        "AAAAAQAAAAAAAAAAAAAAC1BlbmRpbmdSb29tAAAAAAUAAAAAAAAADmNyZWF0ZWRfbGVkZ2VyAAAAAAAEAAAAAAAAAAdjcmVhdG9yAAAAABMAAAAAAAAACWlzX3B1YmxpYwAAAAAAAAEAAAAAAAAADXBhc3N3b3JkX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAFc3Rha2UAAAAAAAAL",
        "AAAAAAAAAHJGaXJlIGEgc2hvdC4gQm90aCBwbGF5ZXJzIGZpcmUgaW5kZXBlbmRlbnRseSBkdXJpbmcgRmlyaW5nIHBoYXNlLgpXaGVuIGJvdGggaGF2ZSBmaXJlZCwgdHJhbnNpdGlvbnMgdG8gUmVzcG9uZGluZy4AAAAAAARmaXJlAAAABAAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAh0YXJnZXRfeAAAAAQAAAAAAAAACHRhcmdldF95AAAABAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAGc2V0X3ZrAAAAAAACAAAAAAAAAAxjaXJjdWl0X3R5cGUAAAAEAAAAAAAAAAJ2awAAAAAADgAAAAA=",
        "AAAAAAAAAAAAAAAHZ2V0X2h1YgAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAIFSZXNwb25kIHRvIHRoZSByb3VuZDogcHJvdmUgaGl0L21pc3MgYW5kIHN1Ym1pdCBuZXcgcG9zaXRpb24uCkJvdGggcGxheWVycyBjYWxsIGluZGVwZW5kZW50bHkuIFdoZW4gYm90aCByZXNwb25kLCByb3VuZCByZXNvbHZlcy4AAAAAAAAHcmVzcG9uZAAAAAAIAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAAB3dhc19oaXQAAAAAAQAAAAAAAAAObmV3X2NvbW1pdG1lbnQAAAAAA+4AAAAgAAAAAAAAAApzaG90X3Byb29mAAAAAAAOAAAAAAAAABJzaG90X3B1YmxpY19pbnB1dHMAAAAAAA4AAAAAAAAACm1vdmVfcHJvb2YAAAAAAA4AAAAAAAAAEm1vdmVfcHVibGljX2lucHV0cwAAAAAADgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAHc2V0X2h1YgAAAAABAAAAAAAAAAduZXdfaHViAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAABBSZWFkIGdhbWUgc3RhdGUuAAAACGdldF9nYW1lAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAPpAAAH0AAAAARHYW1lAAAAAw==",
        "AAAAAAAAAAAAAAAIZ2V0X3Jvb20AAAABAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAQAAA+kAAAfQAAAAC1BlbmRpbmdSb29tAAAAAAM=",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAJam9pbl9yb29tAAAAAAAAAwAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGam9pbmVyAAAAAAATAAAAAAAAAAhwYXNzd29yZAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAALY2FuY2VsX3Jvb20AAAAAAgAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAEFDcmVhdGUgYSBuZXcgZ2FtZSBzZXNzaW9uIGRpcmVjdGx5IChmb3IgdGVzdHMgLyBiYWNrd2FyZCBjb21wYXQpLgAAAAAAAAtjcmVhdGVfZ2FtZQAAAAAFAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAAB3BsYXllcjIAAAAAEwAAAAAAAAAOcGxheWVyMV9wb2ludHMAAAAAAAsAAAAAAAAADnBsYXllcjJfcG9pbnRzAAAAAAALAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAALY3JlYXRlX3Jvb20AAAAABQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAVzdGFrZQAAAAAAAAsAAAAAAAAACWlzX3B1YmxpYwAAAAAAAAEAAAAAAAAADXBhc3N3b3JkX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAMZ2V0X3ZlcmlmaWVyAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAMc2V0X3ZlcmlmaWVyAAAAAQAAAAAAAAAMbmV3X3ZlcmlmaWVyAAAAEwAAAAA=",
        "AAAAAAAAAElJbml0aWFsaXplIHdpdGggYWRtaW4sIGdhbWUgaHViLCBaSyB2ZXJpZmllciwgYW5kIG5hdGl2ZSB0b2tlbiBhZGRyZXNzZXMuAAAAAAAADV9fY29uc3RydWN0b3IAAAAAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACGdhbWVfaHViAAAAEwAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAAAAAAxuYXRpdmVfdG9rZW4AAAATAAAAAA==",
        "AAAAAAAAAE9DbGFpbSB0aW1lb3V0IHdpbi4gUGhhc2UtYXdhcmU6IGNhbGxlciBtdXN0IGhhdmUgYWN0ZWQsIG9wcG9uZW50IG11c3Qgbm90IGhhdmUuAAAAAA1jbGFpbV90aW1lb3V0AAAAAAAAAgAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAA+kAAAATAAAAAw==",
        "AAAAAAAAAEdDb21taXQgaW5pdGlhbCBwb3NpdGlvbiB3aXRoIFpLIHByb29mLiBCb3RoIHBsYXllcnMgY2FsbCBpbmRlcGVuZGVudGx5LgAAAAAPY29tbWl0X3Bvc2l0aW9uAAAAAAUAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAAAAAAKY29tbWl0bWVudAAAAAAD7gAAACAAAAAAAAAABXByb29mAAAAAAAADgAAAAAAAAANcHVibGljX2lucHV0cwAAAAAAAA4AAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAEVHZXQgYSBwbGF5ZXIncyBhY3RpdmUgZ2FtZSBzZXNzaW9uIElELiBSZXR1cm5zIE5vbmUgaWYgbm90IGluIGEgZ2FtZS4AAAAAAAAPZ2V0X2FjdGl2ZV9nYW1lAAAAAAEAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAPoAAAABA==",
        "AAAAAAAAAAAAAAARbGlzdF9wdWJsaWNfcm9vbXMAAAAAAAAAAAAAAQAAA+oAAAAE" ]),
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
        get_active_game: this.txFromJSON<Option<u32>>,
        list_public_rooms: this.txFromJSON<Array<u32>>
  }
}