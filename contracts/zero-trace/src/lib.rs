#![no_std]

//! # Zero Trace — ZK Battleship on Stellar
//!
//! A two-player hide-and-seek game on a 6×6 grid. Each player IS a single hidden
//! unit. Players commit positions with ZK proofs (Noir + UltraHonk), fire at each
//! other's cells, and prove hits/misses without ever revealing their location.
//!
//! **Room System:**
//! - Public rooms: listed and joinable by anyone
//! - Private rooms: password-protected, share room ID + password to invite
//!
//! **ZK Mechanics:**
//! - Position commitment: Poseidon hash of (x, y, salt), verified on-chain
//! - Shot verification: Target proves hit/miss without revealing position
//! - Move validation: Player proves they moved to a valid adjacent cell
//!
//! **Game Hub Integration:**
//! Calls `start_game` and `end_game` on the Game Hub contract.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype,
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
}

// ============================================================================
// Data Types
// ============================================================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum GamePhase {
    Setup = 0,
    Playing = 1,
    WaitingResponse = 2,
    Finished = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
    pub player1_commitment: BytesN<32>,
    pub player2_commitment: BytesN<32>,
    pub player1_committed: bool,
    pub player2_committed: bool,
    pub current_turn: u32,
    pub turn_number: u32,
    pub blocked_x: Vec<u32>,
    pub blocked_y: Vec<u32>,
    pub last_action_ledger: u32,
    pub phase: GamePhase,
    pub winner: Option<Address>,
    pub last_shot_x: u32,
    pub last_shot_y: u32,
    pub has_last_shot: bool,
    pub last_shot_hit: u32, // 0=none, 1=miss, 2=hit
    pub player1_alive: bool,
    pub player2_alive: bool,
    pub pending_equalizer: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingRoom {
    pub creator: Address,
    pub stake: i128,
    pub is_public: bool,
    pub password_hash: BytesN<32>, // keccak256; zeroes = no password
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
    PositionVk,
    ShotVk,
    MoveVk,
}

// ============================================================================
// Constants
// ============================================================================

const GAME_TTL_LEDGERS: u32 = 518_400; // 30 days
const TIMEOUT_LEDGERS: u32 = 24;       // ~2 minutes (5s per ledger)
const GRID_SIZE: u32 = 6;

// ============================================================================
// Contract
// ============================================================================

#[contract]
pub struct ZeroTraceContract;

#[contractimpl]
impl ZeroTraceContract {
    /// Initialize with admin, game hub, and ZK verifier addresses.
    pub fn __constructor(env: Env, admin: Address, game_hub: Address, verifier: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::GameHubAddress, &game_hub);
        env.storage().instance().set(&DataKey::VerifierAddress, &verifier);
    }

    // ========================================================================
    // Admin: Store verification keys (as raw JSON bytes for UltraHonk)
    // ========================================================================

    /// Store a verification key for a circuit type.
    /// circuit_type: 0 = position, 1 = shot, 2 = move
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
    // Room System
    // ========================================================================

    /// Create a pending room. Only the creator signs.
    pub fn create_room(
        env: Env,
        session_id: u32,
        creator: Address,
        stake: i128,
        is_public: bool,
        password_hash: BytesN<32>,
    ) -> Result<(), Error> {
        creator.require_auth();

        // Reject if room or game already exists
        let room_key = DataKey::PendingRoom(session_id);
        let game_key = DataKey::Game(session_id);
        if env.storage().temporary().has(&room_key) || env.storage().temporary().has(&game_key) {
            return Err(Error::RoomAlreadyExists);
        }

        let room = PendingRoom {
            creator: creator.clone(),
            stake,
            is_public,
            password_hash,
            created_ledger: env.ledger().sequence(),
        };

        env.storage().temporary().set(&room_key, &room);
        env.storage().temporary().extend_ttl(&room_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        // Add to public room index if public
        if is_public {
            let idx_key = DataKey::PublicRoomIndex;
            let mut index: Vec<u32> = env.storage().persistent().get(&idx_key).unwrap_or(Vec::new(&env));
            index.push_back(session_id);
            env.storage().persistent().set(&idx_key, &index);
            env.storage().persistent().extend_ttl(&idx_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
        }

        Ok(())
    }

    /// Join a pending room. Verifies password for private rooms.
    /// Creates the full Game and calls Game Hub start_game.
    pub fn join_room(
        env: Env,
        session_id: u32,
        joiner: Address,
        password: BytesN<32>,
    ) -> Result<(), Error> {
        joiner.require_auth();

        let room_key = DataKey::PendingRoom(session_id);
        let room: PendingRoom = env.storage().temporary().get(&room_key).ok_or(Error::RoomNotFound)?;

        // Reject self-play
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

        // Call Game Hub start_game
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

        // Create the game
        let game = Game {
            player1: room.creator.clone(),
            player2: joiner.clone(),
            player1_points: room.stake,
            player2_points: room.stake,
            player1_commitment: BytesN::from_array(&env, &[0u8; 32]),
            player2_commitment: BytesN::from_array(&env, &[0u8; 32]),
            player1_committed: false,
            player2_committed: false,
            current_turn: 1,
            turn_number: 0,
            blocked_x: Vec::new(&env),
            blocked_y: Vec::new(&env),
            last_action_ledger: env.ledger().sequence(),
            phase: GamePhase::Setup,
            winner: None,
            last_shot_x: 0,
            last_shot_y: 0,
            has_last_shot: false,
            last_shot_hit: 0,
            player1_alive: true,
            player2_alive: true,
            pending_equalizer: false,
        };

        let game_key = DataKey::Game(session_id);
        env.storage().temporary().set(&game_key, &game);
        env.storage().temporary().extend_ttl(&game_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        // Remove pending room
        env.storage().temporary().remove(&room_key);

        // Remove from public index if public
        if room.is_public {
            Self::remove_from_public_index(&env, session_id);
        }

        Ok(())
    }

    /// Read a pending room (no auth required).
    pub fn get_room(env: Env, session_id: u32) -> Result<PendingRoom, Error> {
        let room_key = DataKey::PendingRoom(session_id);
        env.storage().temporary().get(&room_key).ok_or(Error::RoomNotFound)
    }

    /// List active public room IDs. Prunes expired rooms.
    pub fn list_public_rooms(env: Env) -> Vec<u32> {
        let idx_key = DataKey::PublicRoomIndex;
        let index: Vec<u32> = env.storage().persistent().get(&idx_key).unwrap_or(Vec::new(&env));

        // Prune rooms that no longer exist (expired or joined)
        let mut pruned = Vec::new(&env);
        for id in index.iter() {
            let room_key = DataKey::PendingRoom(id);
            if env.storage().temporary().has(&room_key) {
                pruned.push_back(id);
            }
        }

        // Write back pruned index if it changed
        env.storage().persistent().set(&idx_key, &pruned);
        env.storage().persistent().extend_ttl(&idx_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        pruned
    }

    /// Cancel a pending room. Only the creator can cancel.
    pub fn cancel_room(env: Env, session_id: u32, creator: Address) -> Result<(), Error> {
        creator.require_auth();

        let room_key = DataKey::PendingRoom(session_id);
        let room: PendingRoom = env.storage().temporary().get(&room_key).ok_or(Error::RoomNotFound)?;

        if creator != room.creator {
            return Err(Error::NotCreator);
        }

        env.storage().temporary().remove(&room_key);

        if room.is_public {
            Self::remove_from_public_index(&env, session_id);
        }

        Ok(())
    }

    // ========================================================================
    // Game Lifecycle (kept for backward compat with tests)
    // ========================================================================

    /// Create a new game session. Both players must authorize their stakes.
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

        // Call Game Hub start_game
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

        let game = Game {
            player1: player1.clone(),
            player2: player2.clone(),
            player1_points,
            player2_points,
            player1_commitment: BytesN::from_array(&env, &[0u8; 32]),
            player2_commitment: BytesN::from_array(&env, &[0u8; 32]),
            player1_committed: false,
            player2_committed: false,
            current_turn: 1,
            turn_number: 0,
            blocked_x: Vec::new(&env),
            blocked_y: Vec::new(&env),
            last_action_ledger: env.ledger().sequence(),
            phase: GamePhase::Setup,
            winner: None,
            last_shot_x: 0,
            last_shot_y: 0,
            has_last_shot: false,
            last_shot_hit: 0,
            player1_alive: true,
            player2_alive: true,
            pending_equalizer: false,
        };

        let key = DataKey::Game(session_id);
        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(())
    }

    /// Commit initial position with ZK proof.
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

        // Verify ZK proof for position commitment
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

        // If both committed, transition to Playing
        if game.player1_committed && game.player2_committed {
            game.phase = GamePhase::Playing;
            game.current_turn = 1; // Player 1 always goes first
        }

        game.last_action_ledger = env.ledger().sequence();
        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(())
    }

    /// Fire a shot at a target cell. Only the active player can fire.
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

        if game.phase != GamePhase::Playing {
            return Err(Error::InvalidPhase);
        }
        if game.winner.is_some() {
            return Err(Error::GameAlreadyEnded);
        }

        // Check it's this player's turn
        let is_p1 = player == game.player1;
        let is_p2 = player == game.player2;
        if !is_p1 && !is_p2 {
            return Err(Error::NotPlayer);
        }
        let player_num = if is_p1 { 1u32 } else { 2u32 };
        if game.current_turn != player_num {
            return Err(Error::NotYourTurn);
        }

        // Validate coordinates
        if target_x >= GRID_SIZE || target_y >= GRID_SIZE {
            return Err(Error::InvalidCoordinate);
        }

        // Store the shot and transition to WaitingResponse
        game.last_shot_x = target_x;
        game.last_shot_y = target_y;
        game.has_last_shot = true;
        game.last_shot_hit = 0; // pending
        game.phase = GamePhase::WaitingResponse;
        game.last_action_ledger = env.ledger().sequence();

        // Add to blocked cells
        game.blocked_x.push_back(target_x);
        game.blocked_y.push_back(target_y);

        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(())
    }

    /// Target player responds to a shot: proves hit/miss AND moves to new position.
    pub fn respond(
        env: Env,
        session_id: u32,
        player: Address,
        hit: bool,
        new_commitment: BytesN<32>,
        shot_proof: Bytes,
        shot_public_inputs: Bytes,
        move_proof: Bytes,
        move_public_inputs: Bytes,
    ) -> Result<(), Error> {
        player.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: Game = env.storage().temporary().get(&key).ok_or(Error::GameNotFound)?;

        if game.phase != GamePhase::WaitingResponse {
            return Err(Error::NoShotToRespond);
        }
        if game.winner.is_some() {
            return Err(Error::GameAlreadyEnded);
        }

        // The responder is the opponent of whoever fired
        let is_p1 = player == game.player1;
        let is_p2 = player == game.player2;
        if !is_p1 && !is_p2 {
            return Err(Error::NotPlayer);
        }

        // The responder must be the one who was shot at (NOT the current_turn player)
        let expected_responder = if game.current_turn == 1 { 2u32 } else { 1u32 };
        let responder_num = if is_p1 { 1u32 } else { 2u32 };
        if responder_num != expected_responder {
            return Err(Error::NotYourTurn);
        }

        // Verify shot proof (proves hit/miss is truthful)
        Self::verify_zk_proof(&env, &DataKey::ShotVk, &shot_proof, &shot_public_inputs)?;

        // Verify move proof (proves new position is valid adjacent move)
        Self::verify_zk_proof(&env, &DataKey::MoveVk, &move_proof, &move_public_inputs)?;

        // Update commitment to new position
        if is_p1 {
            game.player1_commitment = new_commitment;
        } else {
            game.player2_commitment = new_commitment;
        }

        game.last_shot_hit = if hit { 2 } else { 1 };
        game.last_action_ledger = env.ledger().sequence();

        if hit {
            // Mark the target as hit
            if is_p1 {
                game.player1_alive = false;
            } else {
                game.player2_alive = false;
            }

            if !game.pending_equalizer {
                // First hit of the game — give opponent one equalizer shot
                game.pending_equalizer = true;
                let opponent_turn = if game.current_turn == 1 { 2u32 } else { 1u32 };
                game.current_turn = opponent_turn;
                game.phase = GamePhase::Playing;
            } else {
                // Equalizer phase: someone hit back — the equalizer shooter wins
                let equalizer_shooter = game.current_turn;
                let final_winner = if equalizer_shooter == 1 {
                    game.player1.clone()
                } else {
                    game.player2.clone()
                };

                game.winner = Some(final_winner.clone());
                game.phase = GamePhase::Finished;

                let hub_addr: Address = env.storage().instance().get(&DataKey::GameHubAddress).expect("no hub");
                let hub = GameHubClient::new(&env, &hub_addr);
                let player1_won = final_winner == game.player1;
                hub.end_game(&session_id, &player1_won);
            }
        } else {
            // Miss — continue game
            game.turn_number += 1;

            if game.pending_equalizer {
                // Equalizer shot missed — the original shooter wins
                let original_shooter = if game.current_turn == 1 { 2u32 } else { 1u32 };
                let winner = if original_shooter == 1 {
                    game.player1.clone()
                } else {
                    game.player2.clone()
                };
                game.winner = Some(winner.clone());
                game.phase = GamePhase::Finished;

                let hub_addr: Address = env.storage().instance().get(&DataKey::GameHubAddress).expect("no hub");
                let hub = GameHubClient::new(&env, &hub_addr);
                let player1_won = winner == game.player1;
                hub.end_game(&session_id, &player1_won);
            } else {
                // Normal turn progression: switch to the other player
                game.current_turn = if game.current_turn == 1 { 2 } else { 1 };
                game.phase = GamePhase::Playing;
            }
        }

        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(())
    }

    /// Claim victory by timeout. If opponent hasn't acted in ~2 minutes, caller wins.
    pub fn claim_timeout(
        env: Env,
        session_id: u32,
        player: Address,
    ) -> Result<Address, Error> {
        player.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: Game = env.storage().temporary().get(&key).ok_or(Error::GameNotFound)?;

        if game.winner.is_some() {
            return Err(Error::GameAlreadyEnded);
        }

        let is_p1 = player == game.player1;
        let is_p2 = player == game.player2;
        if !is_p1 && !is_p2 {
            return Err(Error::NotPlayer);
        }

        let elapsed = env.ledger().sequence() - game.last_action_ledger;
        if elapsed < TIMEOUT_LEDGERS {
            return Err(Error::TimedOut); // Not timed out yet
        }

        // The player claiming timeout wins
        let winner = player.clone();
        game.winner = Some(winner.clone());
        game.phase = GamePhase::Finished;

        // Call Game Hub
        let hub_addr: Address = env.storage().instance().get(&DataKey::GameHubAddress).expect("no hub");
        let hub = GameHubClient::new(&env, &hub_addr);
        let player1_won = winner == game.player1;
        hub.end_game(&session_id, &player1_won);

        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(winner)
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

    fn verify_zk_proof(
        env: &Env,
        vk_key: &DataKey,
        proof: &Bytes,
        public_inputs: &Bytes,
    ) -> Result<(), Error> {
        // Skip verification if VK is not set (development / testnet mode)
        let vk_opt: Option<Bytes> = env.storage().instance().get(vk_key);
        let vk_json = match vk_opt {
            Some(vk) => vk,
            None => return Ok(()), // No VK stored — skip verification
        };

        let verifier_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::VerifierAddress)
            .expect("no verifier");

        // Pack proof_blob: [4-byte count][public_inputs][proof]
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
