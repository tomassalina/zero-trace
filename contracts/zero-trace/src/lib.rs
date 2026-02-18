#![no_std]

//! # Zero Trace — ZK Battleship on Stellar
//!
//! A two-player hide-and-seek game on a 6x6 grid with **simultaneous turns**.
//! Both players commit positions with ZK proofs, fire at the same time, and
//! prove hits/misses without revealing their location.
//!
//! **Game Flow:**
//! 1. Setup: Both commit positions (3 min timeout, else cancel & refund)
//! 2. Firing: Both fire simultaneously (3 min timeout)
//! 3. Responding: Both prove hit/miss + move (3 min timeout)
//! 4. Repeat until someone is hit (or both hit → draw, or 36 rounds → draw)
//!
//! **Room System:**
//! - Public rooms: listed and joinable by anyone (10 min expiry)
//! - Private rooms: password-protected via keccak256 hash
//! - Each player can only be in one active game/room at a time
//!
//! **Escrow:**
//! - Stakes are transferred to the contract on create_room/join_room
//! - Winner gets 90% of the pot, 10% protocol fee to admin
//! - Draw/cancel: full refund to both players

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, token,
    vec, Address, Bytes, BytesN, Env, IntoVal, Vec,
};

// ============================================================================
// External Contract Interfaces
// ============================================================================

#[contractclient(name = "GameHubClient")]
pub trait GameHub {
    fn start_game(
        env: Env,
        game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    );

    fn end_game(env: Env, session_id: u32, player1_won: bool);
}

#[contractclient(name = "VerifierClient")]
pub trait ZkVerifier {
    fn verify_proof(env: Env, vk_json: Bytes, proof_blob: Bytes) -> BytesN<32>;
}

// ============================================================================
// Errors
// ============================================================================

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    GameNotFound = 1,
    NotPlayer = 2,
    GameAlreadyEnded = 3,
    NotYourTurn = 4,
    InvalidPhase = 5,
    AlreadyCommitted = 6,
    InvalidProof = 7,
    CellBlocked = 8,
    TimedOut = 9,
    SelfPlay = 10,
    InvalidCoordinate = 11,
    WaitingForResponse = 12,
    NoShotToRespond = 13,
    RoomNotFound = 14,
    RoomAlreadyExists = 15,
    WrongPassword = 16,
    NotCreator = 17,
    AlreadyFired = 18,
    AlreadyResponded = 19,
    AlreadyInGame = 20,
}

// ============================================================================
// Data Types
// ============================================================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum GamePhase {
    Setup = 0,
    Firing = 1,
    Responding = 2,
    Finished = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
    // ZK commitments
    pub player1_commitment: BytesN<32>,
    pub player2_commitment: BytesN<32>,
    pub player1_committed: bool,
    pub player2_committed: bool,
    // Simultaneous shots
    pub player1_shot_x: u32,
    pub player1_shot_y: u32,
    pub player2_shot_x: u32,
    pub player2_shot_y: u32,
    pub player1_has_shot: bool,
    pub player2_has_shot: bool,
    // Simultaneous responses
    pub player1_responded: bool,
    pub player2_responded: bool,
    pub player1_was_hit: bool,
    pub player2_was_hit: bool,
    // Round tracking
    pub round_number: u32,
    pub blocked_x: Vec<u32>,
    pub blocked_y: Vec<u32>,
    // Timing & state
    pub last_action_ledger: u32,
    pub phase: GamePhase,
    pub winner: Option<Address>,
    pub is_draw: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingRoom {
    pub creator: Address,
    pub stake: i128,
    pub is_public: bool,
    pub password_hash: BytesN<32>,
    pub created_ledger: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Game(u32),
    PendingRoom(u32),
    PublicRoomIndex,
    GameHubAddress,
    Admin,
    VerifierAddress,
    NativeToken,
    PositionVk,
    ShotVk,
    MoveVk,
    ActiveGame(Address),
}

// ============================================================================
// Constants
// ============================================================================

const GAME_TTL_LEDGERS: u32 = 518_400;     // 30 days
const ROOM_TIMEOUT_LEDGERS: u32 = 120;     // 10 min (public room expiry)
const SETUP_TIMEOUT_LEDGERS: u32 = 36;     // 3 min (both must commit)
const ACTION_TIMEOUT_LEDGERS: u32 = 36;    // 3 min (fire/respond deadline)
const GRID_SIZE: u32 = 6;
const MAX_ROUNDS: u32 = 36;                // Draw if both survive this many rounds
const PROTOCOL_FEE_BPS: i128 = 1000;       // 10% protocol fee (1000/10000)

// ============================================================================
// Contract
// ============================================================================

#[contract]
pub struct ZeroTraceContract;

#[contractimpl]
impl ZeroTraceContract {
    /// Initialize with admin, game hub, ZK verifier, and native token addresses.
    pub fn __constructor(env: Env, admin: Address, game_hub: Address, verifier: Address, native_token: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::GameHubAddress, &game_hub);
        env.storage().instance().set(&DataKey::VerifierAddress, &verifier);
        env.storage().instance().set(&DataKey::NativeToken, &native_token);
    }

    // ========================================================================
    // Admin: Store verification keys
    // ========================================================================

    pub fn set_vk(env: Env, circuit_type: u32, vk: Bytes) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("no admin");
        admin.require_auth();
        let key = match circuit_type {
            0 => DataKey::PositionVk,
            1 => DataKey::ShotVk,
            2 => DataKey::MoveVk,
            _ => panic!("invalid circuit_type"),
        };
        env.storage().instance().set(&key, &vk);
    }

    // ========================================================================
    // Active Game Tracking
    // ========================================================================

    /// Get a player's active game session ID. Returns None if not in a game.
    pub fn get_active_game(env: Env, player: Address) -> Option<u32> {
        let key = DataKey::ActiveGame(player);
        env.storage().temporary().get(&key)
    }

    fn set_active_game(env: &Env, player: &Address, session_id: u32) {
        let key = DataKey::ActiveGame(player.clone());
        env.storage().temporary().set(&key, &session_id);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
    }

    fn clear_active_game(env: &Env, player: &Address) {
        let key = DataKey::ActiveGame(player.clone());
        if env.storage().temporary().has(&key) {
            env.storage().temporary().remove(&key);
        }
    }

    fn require_no_active_game(env: &Env, player: &Address) -> Result<(), Error> {
        let key = DataKey::ActiveGame(player.clone());
        if let Some(sid) = env.storage().temporary().get::<DataKey, u32>(&key) {
            // Check if there's an active game (not finished)
            let game_key = DataKey::Game(sid);
            if let Some(game) = env.storage().temporary().get::<DataKey, Game>(&game_key) {
                if game.phase != GamePhase::Finished {
                    return Err(Error::AlreadyInGame);
                }
            } else {
                // No game yet — check if there's a pending room
                let room_key = DataKey::PendingRoom(sid);
                if env.storage().temporary().has(&room_key) {
                    return Err(Error::AlreadyInGame);
                }
            }
            // Game finished and room gone — clear stale reference
            env.storage().temporary().remove(&key);
        }
        Ok(())
    }

    // ========================================================================
    // Token Helpers
    // ========================================================================

    fn get_token<'a>(env: &'a Env) -> token::Client<'a> {
        let addr: Address = env.storage().instance().get(&DataKey::NativeToken).expect("no token");
        token::Client::new(env, &addr)
    }

    fn get_admin_addr(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).expect("no admin")
    }

    /// Transfer stake from player to contract (escrow deposit)
    fn collect_stake(env: &Env, from: &Address, amount: i128) {
        let xlm = Self::get_token(env);
        xlm.transfer(from, &env.current_contract_address(), &amount);
    }

    /// Refund stake from contract to player
    fn refund_stake(env: &Env, to: &Address, amount: i128) {
        let xlm = Self::get_token(env);
        xlm.transfer(&env.current_contract_address(), to, &amount);
    }

    /// Pay winner: 90% of pot to winner, 10% fee to admin
    fn pay_winner_from_pot(env: &Env, winner: &Address, total_pot: i128) {
        let fee = total_pot * PROTOCOL_FEE_BPS / 10_000;
        let prize = total_pot - fee;
        let xlm = Self::get_token(env);
        xlm.transfer(&env.current_contract_address(), winner, &prize);
        if fee > 0 {
            let admin = Self::get_admin_addr(env);
            xlm.transfer(&env.current_contract_address(), &admin, &fee);
        }
    }

    /// Refund both players their full stakes
    fn refund_both_players(env: &Env, game: &Game) {
        let xlm = Self::get_token(env);
        xlm.transfer(&env.current_contract_address(), &game.player1, &game.player1_points);
        xlm.transfer(&env.current_contract_address(), &game.player2, &game.player2_points);
    }

    // ========================================================================
    // Room System
    // ========================================================================

    pub fn create_room(
        env: Env,
        session_id: u32,
        creator: Address,
        stake: i128,
        is_public: bool,
        password_hash: BytesN<32>,
    ) -> Result<(), Error> {
        creator.require_auth();

        // Check player isn't already in a game or room
        Self::require_no_active_game(&env, &creator)?;

        let room_key = DataKey::PendingRoom(session_id);
        let game_key = DataKey::Game(session_id);
        if env.storage().temporary().has(&room_key) || env.storage().temporary().has(&game_key) {
            return Err(Error::RoomAlreadyExists);
        }

        // Collect stake from creator into escrow
        Self::collect_stake(&env, &creator, stake);

        let room = PendingRoom {
            creator: creator.clone(),
            stake,
            is_public,
            password_hash,
            created_ledger: env.ledger().sequence(),
        };

        env.storage().temporary().set(&room_key, &room);
        env.storage().temporary().extend_ttl(&room_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        // Track active game for creator (room counts as active)
        Self::set_active_game(&env, &creator, session_id);

        if is_public {
            let idx_key = DataKey::PublicRoomIndex;
            let mut index: Vec<u32> = env.storage().persistent().get(&idx_key).unwrap_or(Vec::new(&env));
            index.push_back(session_id);
            env.storage().persistent().set(&idx_key, &index);
            env.storage().persistent().extend_ttl(&idx_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
        }

        Ok(())
    }

    pub fn join_room(
        env: Env,
        session_id: u32,
        joiner: Address,
        password: BytesN<32>,
    ) -> Result<(), Error> {
        joiner.require_auth();

        // Check joiner isn't already in a game
        Self::require_no_active_game(&env, &joiner)?;

        let room_key = DataKey::PendingRoom(session_id);
        let room: PendingRoom = env.storage().temporary().get(&room_key).ok_or(Error::RoomNotFound)?;

        // Check room expiry (10 min)
        // Note: refund happens via cancel_room or list_public_rooms pruning,
        // not here — returning Err rolls back all state changes including refunds.
        let elapsed = env.ledger().sequence() - room.created_ledger;
        if elapsed > ROOM_TIMEOUT_LEDGERS {
            return Err(Error::RoomNotFound);
        }

        if joiner == room.creator {
            return Err(Error::SelfPlay);
        }

        // Verify password for private rooms
        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
        if room.password_hash != zero_hash {
            let provided_hash = env.crypto().keccak256(&Bytes::from_slice(&env, &password.to_array()));
            let provided_hash_bytes = BytesN::from_array(&env, &provided_hash.to_array());
            if provided_hash_bytes != room.password_hash {
                return Err(Error::WrongPassword);
            }
        }

        // Collect stake from joiner into escrow
        Self::collect_stake(&env, &joiner, room.stake);

        // Call Game Hub
        let hub_addr: Address = env.storage().instance().get(&DataKey::GameHubAddress).expect("no hub");
        let hub = GameHubClient::new(&env, &hub_addr);
        hub.start_game(
            &env.current_contract_address(),
            &session_id,
            &room.creator,
            &joiner,
            &room.stake,
            &room.stake,
        );

        let game = Self::new_game(&env, room.creator.clone(), joiner.clone(), room.stake, room.stake);

        let game_key = DataKey::Game(session_id);
        env.storage().temporary().set(&game_key, &game);
        env.storage().temporary().extend_ttl(&game_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        // Track active game for joiner (creator already tracked)
        Self::set_active_game(&env, &joiner, session_id);

        // Remove pending room
        env.storage().temporary().remove(&room_key);
        if room.is_public {
            Self::remove_from_public_index(&env, session_id);
        }

        Ok(())
    }

    pub fn get_room(env: Env, session_id: u32) -> Result<PendingRoom, Error> {
        let room_key = DataKey::PendingRoom(session_id);
        env.storage().temporary().get(&room_key).ok_or(Error::RoomNotFound)
    }

    pub fn list_public_rooms(env: Env) -> Vec<u32> {
        let idx_key = DataKey::PublicRoomIndex;
        let index: Vec<u32> = env.storage().persistent().get(&idx_key).unwrap_or(Vec::new(&env));

        let mut pruned = Vec::new(&env);
        let current_ledger = env.ledger().sequence();
        for id in index.iter() {
            let room_key = DataKey::PendingRoom(id);
            if let Some(room) = env.storage().temporary().get::<DataKey, PendingRoom>(&room_key) {
                if current_ledger - room.created_ledger <= ROOM_TIMEOUT_LEDGERS {
                    pruned.push_back(id);
                } else {
                    // Expired — refund creator and clean up
                    Self::refund_stake(&env, &room.creator, room.stake);
                    env.storage().temporary().remove(&room_key);
                    Self::clear_active_game(&env, &room.creator);
                }
            }
        }

        env.storage().persistent().set(&idx_key, &pruned);
        env.storage().persistent().extend_ttl(&idx_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        pruned
    }

    pub fn cancel_room(env: Env, session_id: u32, creator: Address) -> Result<(), Error> {
        creator.require_auth();

        let room_key = DataKey::PendingRoom(session_id);
        let room: PendingRoom = env.storage().temporary().get(&room_key).ok_or(Error::RoomNotFound)?;

        if creator != room.creator {
            return Err(Error::NotCreator);
        }

        // Refund creator's stake
        Self::refund_stake(&env, &creator, room.stake);

        env.storage().temporary().remove(&room_key);
        Self::clear_active_game(&env, &creator);
        if room.is_public {
            Self::remove_from_public_index(&env, session_id);
        }

        Ok(())
    }

    // ========================================================================
    // Game Lifecycle
    // ========================================================================

    /// Create a new game session directly (for tests / backward compat).
    pub fn create_game(
        env: Env,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    ) -> Result<(), Error> {
        if player1 == player2 {
            return Err(Error::SelfPlay);
        }

        player1.require_auth_for_args(vec![
            &env,
            session_id.into_val(&env),
            player1_points.into_val(&env),
        ]);
        player2.require_auth_for_args(vec![
            &env,
            session_id.into_val(&env),
            player2_points.into_val(&env),
        ]);

        // Collect stakes from both players
        Self::collect_stake(&env, &player1, player1_points);
        Self::collect_stake(&env, &player2, player2_points);

        let hub_addr: Address = env.storage().instance().get(&DataKey::GameHubAddress).expect("no hub");
        let hub = GameHubClient::new(&env, &hub_addr);
        hub.start_game(
            &env.current_contract_address(),
            &session_id,
            &player1,
            &player2,
            &player1_points,
            &player2_points,
        );

        let game = Self::new_game(&env, player1.clone(), player2.clone(), player1_points, player2_points);

        let key = DataKey::Game(session_id);
        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        // Track active games
        Self::set_active_game(&env, &player1, session_id);
        Self::set_active_game(&env, &player2, session_id);

        Ok(())
    }

    /// Commit initial position with ZK proof. Both players call independently.
    pub fn commit_position(
        env: Env,
        session_id: u32,
        player: Address,
        commitment: BytesN<32>,
        proof: Bytes,
        public_inputs: Bytes,
    ) -> Result<(), Error> {
        player.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: Game = env.storage().temporary().get(&key).ok_or(Error::GameNotFound)?;

        if game.phase != GamePhase::Setup {
            return Err(Error::InvalidPhase);
        }

        Self::verify_zk_proof(&env, &DataKey::PositionVk, &proof, &public_inputs)?;

        if player == game.player1 {
            if game.player1_committed {
                return Err(Error::AlreadyCommitted);
            }
            game.player1_commitment = commitment;
            game.player1_committed = true;
        } else if player == game.player2 {
            if game.player2_committed {
                return Err(Error::AlreadyCommitted);
            }
            game.player2_commitment = commitment;
            game.player2_committed = true;
        } else {
            return Err(Error::NotPlayer);
        }

        // Both committed → transition to Firing
        if game.player1_committed && game.player2_committed {
            game.phase = GamePhase::Firing;
        }

        game.last_action_ledger = env.ledger().sequence();
        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(())
    }

    /// Fire a shot. Both players fire independently during Firing phase.
    /// When both have fired, transitions to Responding.
    pub fn fire(
        env: Env,
        session_id: u32,
        player: Address,
        target_x: u32,
        target_y: u32,
    ) -> Result<(), Error> {
        player.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: Game = env.storage().temporary().get(&key).ok_or(Error::GameNotFound)?;

        if game.phase != GamePhase::Firing {
            return Err(Error::InvalidPhase);
        }
        if game.winner.is_some() {
            return Err(Error::GameAlreadyEnded);
        }

        if target_x >= GRID_SIZE || target_y >= GRID_SIZE {
            return Err(Error::InvalidCoordinate);
        }

        let is_p1 = player == game.player1;
        let is_p2 = player == game.player2;
        if !is_p1 && !is_p2 {
            return Err(Error::NotPlayer);
        }

        if is_p1 {
            if game.player1_has_shot {
                return Err(Error::AlreadyFired);
            }
            game.player1_shot_x = target_x;
            game.player1_shot_y = target_y;
            game.player1_has_shot = true;
        } else {
            if game.player2_has_shot {
                return Err(Error::AlreadyFired);
            }
            game.player2_shot_x = target_x;
            game.player2_shot_y = target_y;
            game.player2_has_shot = true;
        }

        game.last_action_ledger = env.ledger().sequence();

        // Both fired → transition to Responding
        if game.player1_has_shot && game.player2_has_shot {
            game.phase = GamePhase::Responding;
        }

        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(())
    }

    /// Respond to the round: prove hit/miss and submit new position.
    /// Both players call independently. When both respond, round resolves.
    pub fn respond(
        env: Env,
        session_id: u32,
        player: Address,
        was_hit: bool,
        new_commitment: BytesN<32>,
        shot_proof: Bytes,
        shot_public_inputs: Bytes,
        move_proof: Bytes,
        move_public_inputs: Bytes,
    ) -> Result<(), Error> {
        player.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: Game = env.storage().temporary().get(&key).ok_or(Error::GameNotFound)?;

        if game.phase != GamePhase::Responding {
            return Err(Error::InvalidPhase);
        }
        if game.winner.is_some() {
            return Err(Error::GameAlreadyEnded);
        }

        let is_p1 = player == game.player1;
        let is_p2 = player == game.player2;
        if !is_p1 && !is_p2 {
            return Err(Error::NotPlayer);
        }

        if is_p1 {
            if game.player1_responded {
                return Err(Error::AlreadyResponded);
            }
        } else {
            if game.player2_responded {
                return Err(Error::AlreadyResponded);
            }
        }

        // Verify shot proof
        Self::verify_zk_proof(&env, &DataKey::ShotVk, &shot_proof, &shot_public_inputs)?;

        // If not hit, verify move proof
        if !was_hit {
            Self::verify_zk_proof(&env, &DataKey::MoveVk, &move_proof, &move_public_inputs)?;
        }

        if is_p1 {
            game.player1_commitment = new_commitment;
            game.player1_was_hit = was_hit;
            game.player1_responded = true;
        } else {
            game.player2_commitment = new_commitment;
            game.player2_was_hit = was_hit;
            game.player2_responded = true;
        }

        game.last_action_ledger = env.ledger().sequence();

        // Both responded → resolve the round
        if game.player1_responded && game.player2_responded {
            Self::resolve_round(&env, &mut game, session_id);
        }

        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(())
    }

    /// Claim timeout win. Phase-aware: caller must have acted, opponent must not have.
    pub fn claim_timeout(
        env: Env,
        session_id: u32,
        player: Address,
    ) -> Result<Address, Error> {
        player.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: Game = env.storage().temporary().get(&key).ok_or(Error::GameNotFound)?;

        if game.winner.is_some() || game.phase == GamePhase::Finished {
            return Err(Error::GameAlreadyEnded);
        }

        let is_p1 = player == game.player1;
        let is_p2 = player == game.player2;
        if !is_p1 && !is_p2 {
            return Err(Error::NotPlayer);
        }

        let elapsed = env.ledger().sequence() - game.last_action_ledger;

        match game.phase {
            GamePhase::Setup => {
                if elapsed < SETUP_TIMEOUT_LEDGERS {
                    return Err(Error::TimedOut);
                }
                // Setup timeout = cancel/draw, refund both
                game.is_draw = true;
                game.phase = GamePhase::Finished;
                Self::refund_both_players(&env, &game);
                Self::clear_active_game(&env, &game.player1);
                Self::clear_active_game(&env, &game.player2);
            }
            GamePhase::Firing => {
                if elapsed < ACTION_TIMEOUT_LEDGERS {
                    return Err(Error::TimedOut);
                }
                let caller_fired = if is_p1 { game.player1_has_shot } else { game.player2_has_shot };
                if !caller_fired {
                    return Err(Error::InvalidPhase);
                }
                game.winner = Some(player.clone());
                game.phase = GamePhase::Finished;
                // Winner gets pot minus fee
                let total_pot = game.player1_points + game.player2_points;
                Self::pay_winner_from_pot(&env, &player, total_pot);
                let hub_addr: Address = env.storage().instance().get(&DataKey::GameHubAddress).expect("no hub");
                let hub = GameHubClient::new(&env, &hub_addr);
                hub.end_game(&session_id, &is_p1);
                Self::clear_active_game(&env, &game.player1);
                Self::clear_active_game(&env, &game.player2);
            }
            GamePhase::Responding => {
                if elapsed < ACTION_TIMEOUT_LEDGERS {
                    return Err(Error::TimedOut);
                }
                let caller_responded = if is_p1 { game.player1_responded } else { game.player2_responded };
                if !caller_responded {
                    return Err(Error::InvalidPhase);
                }
                game.winner = Some(player.clone());
                game.phase = GamePhase::Finished;
                // Winner gets pot minus fee
                let total_pot = game.player1_points + game.player2_points;
                Self::pay_winner_from_pot(&env, &player, total_pot);
                let hub_addr: Address = env.storage().instance().get(&DataKey::GameHubAddress).expect("no hub");
                let hub = GameHubClient::new(&env, &hub_addr);
                hub.end_game(&session_id, &is_p1);
                Self::clear_active_game(&env, &game.player1);
                Self::clear_active_game(&env, &game.player2);
            }
            GamePhase::Finished => {
                return Err(Error::GameAlreadyEnded);
            }
        }

        let result = player.clone();
        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(result)
    }

    /// Read game state.
    pub fn get_game(env: Env, session_id: u32) -> Result<Game, Error> {
        let key = DataKey::Game(session_id);
        env.storage().temporary().get(&key).ok_or(Error::GameNotFound)
    }

    // ========================================================================
    // Admin Functions
    // ========================================================================

    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).expect("no admin")
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("no admin");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    pub fn get_hub(env: Env) -> Address {
        env.storage().instance().get(&DataKey::GameHubAddress).expect("no hub")
    }

    pub fn set_hub(env: Env, new_hub: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("no admin");
        admin.require_auth();
        env.storage().instance().set(&DataKey::GameHubAddress, &new_hub);
    }

    pub fn get_verifier(env: Env) -> Address {
        env.storage().instance().get(&DataKey::VerifierAddress).expect("no verifier")
    }

    pub fn set_verifier(env: Env, new_verifier: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("no admin");
        admin.require_auth();
        env.storage().instance().set(&DataKey::VerifierAddress, &new_verifier);
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("no admin");
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    // ========================================================================
    // Internal Helpers
    // ========================================================================

    fn new_game(env: &Env, player1: Address, player2: Address, p1_points: i128, p2_points: i128) -> Game {
        Game {
            player1,
            player2,
            player1_points: p1_points,
            player2_points: p2_points,
            player1_commitment: BytesN::from_array(env, &[0u8; 32]),
            player2_commitment: BytesN::from_array(env, &[0u8; 32]),
            player1_committed: false,
            player2_committed: false,
            player1_shot_x: 0,
            player1_shot_y: 0,
            player2_shot_x: 0,
            player2_shot_y: 0,
            player1_has_shot: false,
            player2_has_shot: false,
            player1_responded: false,
            player2_responded: false,
            player1_was_hit: false,
            player2_was_hit: false,
            round_number: 0,
            blocked_x: Vec::new(env),
            blocked_y: Vec::new(env),
            last_action_ledger: env.ledger().sequence(),
            phase: GamePhase::Setup,
            winner: None,
            is_draw: false,
        }
    }

    fn resolve_round(env: &Env, game: &mut Game, session_id: u32) {
        let total_pot = game.player1_points + game.player2_points;

        match (game.player1_was_hit, game.player2_was_hit) {
            (true, true) => {
                // Draw — both hit simultaneously, refund
                game.is_draw = true;
                game.phase = GamePhase::Finished;
                Self::refund_both_players(env, game);
                Self::clear_active_game(env, &game.player1);
                Self::clear_active_game(env, &game.player2);
            }
            (true, false) => {
                // P1 was hit → P2 wins
                game.winner = Some(game.player2.clone());
                game.phase = GamePhase::Finished;
                Self::pay_winner_from_pot(env, &game.player2, total_pot);
                let hub_addr: Address = env.storage().instance().get(&DataKey::GameHubAddress).expect("no hub");
                let hub = GameHubClient::new(env, &hub_addr);
                hub.end_game(&session_id, &false);
                Self::clear_active_game(env, &game.player1);
                Self::clear_active_game(env, &game.player2);
            }
            (false, true) => {
                // P2 was hit → P1 wins
                game.winner = Some(game.player1.clone());
                game.phase = GamePhase::Finished;
                Self::pay_winner_from_pot(env, &game.player1, total_pot);
                let hub_addr: Address = env.storage().instance().get(&DataKey::GameHubAddress).expect("no hub");
                let hub = GameHubClient::new(env, &hub_addr);
                hub.end_game(&session_id, &true);
                Self::clear_active_game(env, &game.player1);
                Self::clear_active_game(env, &game.player2);
            }
            (false, false) => {
                // Neither hit — add shots to blocked, next round
                game.blocked_x.push_back(game.player1_shot_x);
                game.blocked_y.push_back(game.player1_shot_y);
                game.blocked_x.push_back(game.player2_shot_x);
                game.blocked_y.push_back(game.player2_shot_y);

                // Reset round state
                game.player1_has_shot = false;
                game.player2_has_shot = false;
                game.player1_responded = false;
                game.player2_responded = false;
                game.player1_was_hit = false;
                game.player2_was_hit = false;
                game.round_number += 1;

                // Max rounds reached → draw
                if game.round_number >= MAX_ROUNDS {
                    game.is_draw = true;
                    game.phase = GamePhase::Finished;
                    Self::refund_both_players(env, game);
                    Self::clear_active_game(env, &game.player1);
                    Self::clear_active_game(env, &game.player2);
                } else {
                    game.phase = GamePhase::Firing;
                }
            }
        }
    }

    fn verify_zk_proof(
        env: &Env,
        vk_key: &DataKey,
        proof: &Bytes,
        public_inputs: &Bytes,
    ) -> Result<(), Error> {
        let vk_opt: Option<Bytes> = env.storage().instance().get(vk_key);
        let vk_json = match vk_opt {
            Some(vk) => vk,
            None => return Ok(()), // No VK stored — skip verification (dev mode)
        };

        let verifier_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::VerifierAddress)
            .expect("no verifier");

        let mut proof_blob = Bytes::new(env);
        let num_pubs = public_inputs.len() / 32;
        proof_blob.append(&Bytes::from_slice(env, &(num_pubs as u32).to_be_bytes()));
        proof_blob.append(public_inputs);
        proof_blob.append(proof);

        let verifier = VerifierClient::new(env, &verifier_addr);
        let _proof_id = verifier.verify_proof(&vk_json, &proof_blob);
        Ok(())
    }

    fn remove_from_public_index(env: &Env, session_id: u32) {
        let idx_key = DataKey::PublicRoomIndex;
        if let Some(index) = env.storage().persistent().get::<DataKey, Vec<u32>>(&idx_key) {
            let mut new_index = Vec::new(env);
            for id in index.iter() {
                if id != session_id {
                    new_index.push_back(id);
                }
            }
            env.storage().persistent().set(&idx_key, &new_index);
            env.storage().persistent().extend_ttl(&idx_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod test;
