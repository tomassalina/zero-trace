#![cfg(test)]

use crate::{Error, GamePhase, ZeroTraceContract, ZeroTraceContractClient};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env};

// ============================================================================
// Mocks
// ============================================================================

#[contract]
pub struct MockGameHub;

#[contractimpl]
impl MockGameHub {
    pub fn start_game(
        _env: Env, _game_id: Address, _session_id: u32,
        _player1: Address, _player2: Address,
        _player1_points: i128, _player2_points: i128,
    ) {}
    pub fn end_game(_env: Env, _session_id: u32, _player1_won: bool) {}
    pub fn add_game(_env: Env, _game_address: Address) {}
}

#[contract]
pub struct MockVerifier;

#[contractimpl]
impl MockVerifier {
    pub fn verify_proof(
        _env: Env,
        _vk_json: Bytes,
        _proof_blob: Bytes,
    ) -> BytesN<32> {
        BytesN::from_array(&_env, &[0u8; 32])
    }
}

// ============================================================================
// Helpers
// ============================================================================

fn setup_test() -> (
    Env,
    ZeroTraceContractClient<'static>,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 1441065600,
        protocol_version: 25,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: u32::MAX / 2,
        min_persistent_entry_ttl: u32::MAX / 2,
        max_entry_ttl: u32::MAX / 2,
    });

    let hub_addr = env.register(MockGameHub, ());
    let verifier_addr = env.register(MockVerifier, ());
    let admin = Address::generate(&env);

    let contract_id = env.register(ZeroTraceContract, (&admin, &hub_addr, &verifier_addr));
    let client = ZeroTraceContractClient::new(&env, &contract_id);

    // Store dummy VKs for all 3 circuit types (as raw Bytes for UltraHonk)
    let dummy_vk = Bytes::from_slice(&env, b"[\"0x01\"]");
    client.set_vk(&0, &dummy_vk); // position
    client.set_vk(&1, &dummy_vk); // shot
    client.set_vk(&2, &dummy_vk); // move

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    (env, client, player1, player2)
}

fn dummy_proof(env: &Env) -> Bytes {
    Bytes::from_slice(env, &[0u8; 32])
}

fn dummy_commitment(env: &Env, seed: u8) -> BytesN<32> {
    let mut arr = [0u8; 32];
    arr[0] = seed;
    BytesN::from_array(env, &arr)
}

fn zero_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

fn assert_error<T, E>(
    result: &Result<Result<T, E>, Result<Error, soroban_sdk::InvokeError>>,
    expected: Error,
) {
    match result {
        Err(Ok(actual)) => assert_eq!(*actual, expected),
        _ => panic!("Expected error {:?}, got {:?}", expected, result.is_ok()),
    }
}

// ============================================================================
// Game Creation Tests
// ============================================================================

#[test]
fn test_create_game() {
    let (_env, client, player1, player2) = setup_test();
    let session_id = 1u32;
    let points = 500_0000000i128;

    client.create_game(&session_id, &player1, &player2, &points, &points);

    let game = client.get_game(&session_id);
    assert_eq!(game.player1, player1);
    assert_eq!(game.player2, player2);
    assert_eq!(game.player1_points, points);
    assert_eq!(game.phase, GamePhase::Setup);
    assert!(game.winner.is_none());
    assert!(!game.player1_committed);
    assert!(!game.player2_committed);
}

#[test]
fn test_self_play_rejected() {
    let (_env, client, player1, _player2) = setup_test();
    let result = client.try_create_game(&1, &player1, &player1, &100, &100);
    assert_error(&result, Error::SelfPlay);
}

// ============================================================================
// Position Commitment Tests
// ============================================================================

#[test]
fn test_commit_positions() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 2u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let c1 = dummy_commitment(&env, 1);
    let c2 = dummy_commitment(&env, 2);
    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);

    // P1 commits
    client.commit_position(&session_id, &player1, &c1, &proof, &pubs);
    let game = client.get_game(&session_id);
    assert!(game.player1_committed);
    assert!(!game.player2_committed);
    assert_eq!(game.phase, GamePhase::Setup);

    // P2 commits -> transitions to Playing
    client.commit_position(&session_id, &player2, &c2, &proof, &pubs);
    let game = client.get_game(&session_id);
    assert!(game.player2_committed);
    assert_eq!(game.phase, GamePhase::Playing);
    assert_eq!(game.current_turn, 1);
}

#[test]
fn test_cannot_commit_twice() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 3u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let c1 = dummy_commitment(&env, 1);
    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);

    client.commit_position(&session_id, &player1, &c1, &proof, &pubs);
    let result = client.try_commit_position(&session_id, &player1, &c1, &proof, &pubs);
    assert_error(&result, Error::AlreadyCommitted);
}

#[test]
fn test_non_player_cannot_commit() {
    let (env, client, player1, player2) = setup_test();
    let non_player = Address::generate(&env);
    let session_id = 4u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let c = dummy_commitment(&env, 1);
    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);

    let result = client.try_commit_position(&session_id, &non_player, &c, &proof, &pubs);
    assert_error(&result, Error::NotPlayer);
}

// ============================================================================
// Fire Tests
// ============================================================================

#[test]
fn test_fire_shot() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 5u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);
    client.commit_position(&session_id, &player1, &dummy_commitment(&env, 1), &proof, &pubs);
    client.commit_position(&session_id, &player2, &dummy_commitment(&env, 2), &proof, &pubs);

    // P1 fires
    client.fire(&session_id, &player1, &3, &4);
    let game = client.get_game(&session_id);
    assert_eq!(game.phase, GamePhase::WaitingResponse);
    assert!(game.has_last_shot);
    assert_eq!(game.last_shot_x, 3);
    assert_eq!(game.last_shot_y, 4);
    assert_eq!(game.blocked_x.len(), 1);
}

#[test]
fn test_wrong_turn_cannot_fire() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 6u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);
    client.commit_position(&session_id, &player1, &dummy_commitment(&env, 1), &proof, &pubs);
    client.commit_position(&session_id, &player2, &dummy_commitment(&env, 2), &proof, &pubs);

    let result = client.try_fire(&session_id, &player2, &0, &0);
    assert_error(&result, Error::NotYourTurn);
}

#[test]
fn test_invalid_coordinate() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 7u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);
    client.commit_position(&session_id, &player1, &dummy_commitment(&env, 1), &proof, &pubs);
    client.commit_position(&session_id, &player2, &dummy_commitment(&env, 2), &proof, &pubs);

    let result = client.try_fire(&session_id, &player1, &6, &0);
    assert_error(&result, Error::InvalidCoordinate);
}

// ============================================================================
// Respond (Shot Verification + Move) Tests
// ============================================================================

#[test]
fn test_respond_miss() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 8u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);
    client.commit_position(&session_id, &player1, &dummy_commitment(&env, 1), &proof, &pubs);
    client.commit_position(&session_id, &player2, &dummy_commitment(&env, 2), &proof, &pubs);

    client.fire(&session_id, &player1, &0, &0);

    let new_c = dummy_commitment(&env, 10);
    client.respond(
        &session_id, &player2, &false, &new_c,
        &proof, &pubs, &proof, &pubs,
    );

    let game = client.get_game(&session_id);
    assert_eq!(game.phase, GamePhase::Playing);
    assert_eq!(game.current_turn, 2);
    assert_eq!(game.last_shot_hit, 1);
    assert!(game.player1_alive);
    assert!(game.player2_alive);
}

#[test]
fn test_respond_hit_gives_equalizer() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 9u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);
    client.commit_position(&session_id, &player1, &dummy_commitment(&env, 1), &proof, &pubs);
    client.commit_position(&session_id, &player2, &dummy_commitment(&env, 2), &proof, &pubs);

    client.fire(&session_id, &player1, &3, &3);
    let new_c = dummy_commitment(&env, 10);
    client.respond(
        &session_id, &player2, &true, &new_c,
        &proof, &pubs, &proof, &pubs,
    );

    let game = client.get_game(&session_id);
    assert_eq!(game.phase, GamePhase::Playing);
    assert_eq!(game.current_turn, 2);
    assert!(game.pending_equalizer);
    assert!(!game.player2_alive);
}

#[test]
fn test_equalizer_hit_p2_wins() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 10u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);
    client.commit_position(&session_id, &player1, &dummy_commitment(&env, 1), &proof, &pubs);
    client.commit_position(&session_id, &player2, &dummy_commitment(&env, 2), &proof, &pubs);

    client.fire(&session_id, &player1, &3, &3);
    client.respond(&session_id, &player2, &true, &dummy_commitment(&env, 10), &proof, &pubs, &proof, &pubs);

    client.fire(&session_id, &player2, &1, &1);
    client.respond(&session_id, &player1, &true, &dummy_commitment(&env, 20), &proof, &pubs, &proof, &pubs);

    let game = client.get_game(&session_id);
    assert_eq!(game.phase, GamePhase::Finished);
    assert_eq!(game.winner, Some(player2));
}

#[test]
fn test_equalizer_miss_p1_wins() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 11u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);
    client.commit_position(&session_id, &player1, &dummy_commitment(&env, 1), &proof, &pubs);
    client.commit_position(&session_id, &player2, &dummy_commitment(&env, 2), &proof, &pubs);

    client.fire(&session_id, &player1, &3, &3);
    client.respond(&session_id, &player2, &true, &dummy_commitment(&env, 10), &proof, &pubs, &proof, &pubs);

    client.fire(&session_id, &player2, &5, &5);
    client.respond(&session_id, &player1, &false, &dummy_commitment(&env, 20), &proof, &pubs, &proof, &pubs);

    let game = client.get_game(&session_id);
    assert_eq!(game.phase, GamePhase::Finished);
    assert_eq!(game.winner, Some(player1));
}

// ============================================================================
// Full Game Flow
// ============================================================================

#[test]
fn test_full_game_multiple_rounds() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 20u32;
    client.create_game(&session_id, &player1, &player2, &500_0000000, &500_0000000);

    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);
    client.commit_position(&session_id, &player1, &dummy_commitment(&env, 1), &proof, &pubs);
    client.commit_position(&session_id, &player2, &dummy_commitment(&env, 2), &proof, &pubs);

    // Round 1: P1 fires, P2 misses
    client.fire(&session_id, &player1, &0, &0);
    client.respond(&session_id, &player2, &false, &dummy_commitment(&env, 3), &proof, &pubs, &proof, &pubs);

    // Round 1: P2 fires, P1 misses
    client.fire(&session_id, &player2, &5, &5);
    client.respond(&session_id, &player1, &false, &dummy_commitment(&env, 4), &proof, &pubs, &proof, &pubs);

    // Round 2: P1 fires, P2 misses
    client.fire(&session_id, &player1, &1, &1);
    client.respond(&session_id, &player2, &false, &dummy_commitment(&env, 5), &proof, &pubs, &proof, &pubs);

    // Round 2: P2 fires and hits P1!
    client.fire(&session_id, &player2, &2, &2);
    client.respond(&session_id, &player1, &true, &dummy_commitment(&env, 6), &proof, &pubs, &proof, &pubs);

    // P1 gets equalizer, fires and misses
    client.fire(&session_id, &player1, &4, &4);
    client.respond(&session_id, &player2, &false, &dummy_commitment(&env, 7), &proof, &pubs, &proof, &pubs);

    let game = client.get_game(&session_id);
    assert_eq!(game.phase, GamePhase::Finished);
    assert_eq!(game.winner, Some(player2));
    assert_eq!(game.blocked_x.len(), 5);
}

// ============================================================================
// Timeout Tests
// ============================================================================

#[test]
fn test_claim_timeout() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 30u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);
    client.commit_position(&session_id, &player1, &dummy_commitment(&env, 1), &proof, &pubs);
    client.commit_position(&session_id, &player2, &dummy_commitment(&env, 2), &proof, &pubs);

    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 1441065600 + 125,
        protocol_version: 25,
        sequence_number: 125,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: u32::MAX / 2,
        min_persistent_entry_ttl: u32::MAX / 2,
        max_entry_ttl: u32::MAX / 2,
    });

    let winner = client.claim_timeout(&session_id, &player2);
    assert_eq!(winner, player2);

    let game = client.get_game(&session_id);
    assert_eq!(game.phase, GamePhase::Finished);
    assert_eq!(game.winner, Some(player2));
}

#[test]
fn test_cannot_claim_timeout_early() {
    let (_env, client, player1, player2) = setup_test();
    let session_id = 31u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let result = client.try_claim_timeout(&session_id, &player2);
    assert_error(&result, Error::TimedOut);
}

// ============================================================================
// Edge Cases
// ============================================================================

#[test]
fn test_game_not_found() {
    let (_env, client, _p1, _p2) = setup_test();
    let result = client.try_get_game(&999);
    assert_error(&result, Error::GameNotFound);
}

#[test]
fn test_cannot_fire_before_commit() {
    let (_env, client, player1, player2) = setup_test();
    let session_id = 40u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let result = client.try_fire(&session_id, &player1, &0, &0);
    assert_error(&result, Error::InvalidPhase);
}

#[test]
fn test_cannot_fire_after_game_ended() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 41u32;
    client.create_game(&session_id, &player1, &player2, &100, &100);

    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);
    client.commit_position(&session_id, &player1, &dummy_commitment(&env, 1), &proof, &pubs);
    client.commit_position(&session_id, &player2, &dummy_commitment(&env, 2), &proof, &pubs);

    client.fire(&session_id, &player1, &0, &0);
    client.respond(&session_id, &player2, &true, &dummy_commitment(&env, 10), &proof, &pubs, &proof, &pubs);
    client.fire(&session_id, &player2, &5, &5);
    client.respond(&session_id, &player1, &false, &dummy_commitment(&env, 20), &proof, &pubs, &proof, &pubs);

    let result = client.try_fire(&session_id, &player1, &1, &1);
    assert_error(&result, Error::InvalidPhase);
}

// ============================================================================
// Room System Tests
// ============================================================================

#[test]
fn test_create_public_room() {
    let (env, client, player1, _player2) = setup_test();
    let session_id = 100u32;
    let stake = 500_0000000i128;

    client.create_room(&session_id, &player1, &stake, &true, &zero_hash(&env));

    let room = client.get_room(&session_id);
    assert_eq!(room.creator, player1);
    assert_eq!(room.stake, stake);
    assert!(room.is_public);

    let public_rooms = client.list_public_rooms();
    assert_eq!(public_rooms.len(), 1);
    assert_eq!(public_rooms.get(0).unwrap(), session_id);
}

#[test]
fn test_create_private_room() {
    let (env, client, player1, _player2) = setup_test();
    let session_id = 101u32;

    // Hash a password
    let password_bytes = Bytes::from_slice(&env, &[42u8; 32]);
    let password_hash_raw = env.crypto().keccak256(&password_bytes);
    let password_hash = BytesN::from_array(&env, &password_hash_raw.to_array());

    client.create_room(&session_id, &player1, &100, &false, &password_hash);

    let room = client.get_room(&session_id);
    assert!(!room.is_public);
    assert_eq!(room.password_hash, password_hash);

    // Should NOT appear in public room list
    let public_rooms = client.list_public_rooms();
    assert_eq!(public_rooms.len(), 0);
}

#[test]
fn test_join_public_room() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 102u32;

    client.create_room(&session_id, &player1, &100, &true, &zero_hash(&env));

    // Player2 joins
    client.join_room(&session_id, &player2, &zero_hash(&env));

    // Room should be gone
    let result = client.try_get_room(&session_id);
    assert_error(&result, Error::RoomNotFound);

    // Game should exist
    let game = client.get_game(&session_id);
    assert_eq!(game.player1, player1);
    assert_eq!(game.player2, player2);
    assert_eq!(game.phase, GamePhase::Setup);

    // Public list should be empty
    let public_rooms = client.list_public_rooms();
    assert_eq!(public_rooms.len(), 0);
}

#[test]
fn test_join_private_room_correct_password() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 103u32;

    let password = BytesN::from_array(&env, &[42u8; 32]);
    let password_bytes = Bytes::from_slice(&env, &[42u8; 32]);
    let password_hash_raw = env.crypto().keccak256(&password_bytes);
    let password_hash = BytesN::from_array(&env, &password_hash_raw.to_array());

    client.create_room(&session_id, &player1, &100, &false, &password_hash);

    // Join with correct password
    client.join_room(&session_id, &player2, &password);

    let game = client.get_game(&session_id);
    assert_eq!(game.player1, player1);
    assert_eq!(game.player2, player2);
}

#[test]
fn test_join_private_room_wrong_password() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 104u32;

    let password_bytes = Bytes::from_slice(&env, &[42u8; 32]);
    let password_hash_raw = env.crypto().keccak256(&password_bytes);
    let password_hash = BytesN::from_array(&env, &password_hash_raw.to_array());

    client.create_room(&session_id, &player1, &100, &false, &password_hash);

    // Try with wrong password
    let wrong_password = BytesN::from_array(&env, &[99u8; 32]);
    let result = client.try_join_room(&session_id, &player2, &wrong_password);
    assert_error(&result, Error::WrongPassword);
}

#[test]
fn test_self_join_rejected() {
    let (env, client, player1, _player2) = setup_test();
    let session_id = 105u32;

    client.create_room(&session_id, &player1, &100, &true, &zero_hash(&env));

    let result = client.try_join_room(&session_id, &player1, &zero_hash(&env));
    assert_error(&result, Error::SelfPlay);
}

#[test]
fn test_cancel_room() {
    let (env, client, player1, _player2) = setup_test();
    let session_id = 106u32;

    client.create_room(&session_id, &player1, &100, &true, &zero_hash(&env));

    // Verify it exists
    let public_rooms = client.list_public_rooms();
    assert_eq!(public_rooms.len(), 1);

    // Cancel
    client.cancel_room(&session_id, &player1);

    // Should be gone
    let result = client.try_get_room(&session_id);
    assert_error(&result, Error::RoomNotFound);

    let public_rooms = client.list_public_rooms();
    assert_eq!(public_rooms.len(), 0);
}

#[test]
fn test_cancel_room_not_creator() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 107u32;

    client.create_room(&session_id, &player1, &100, &true, &zero_hash(&env));

    // Player2 tries to cancel
    let result = client.try_cancel_room(&session_id, &player2);
    assert_error(&result, Error::NotCreator);
}

#[test]
fn test_list_public_rooms_multiple() {
    let (env, client, player1, _player2) = setup_test();

    client.create_room(&200, &player1, &100, &true, &zero_hash(&env));
    client.create_room(&201, &player1, &200, &true, &zero_hash(&env));
    client.create_room(&202, &player1, &50, &false, &zero_hash(&env)); // private

    let public_rooms = client.list_public_rooms();
    assert_eq!(public_rooms.len(), 2);
    assert_eq!(public_rooms.get(0).unwrap(), 200);
    assert_eq!(public_rooms.get(1).unwrap(), 201);
}

#[test]
fn test_room_already_exists() {
    let (env, client, player1, _player2) = setup_test();
    let session_id = 108u32;

    client.create_room(&session_id, &player1, &100, &true, &zero_hash(&env));

    let result = client.try_create_room(&session_id, &player1, &100, &true, &zero_hash(&env));
    assert_error(&result, Error::RoomAlreadyExists);
}

#[test]
fn test_full_room_to_game_flow() {
    let (env, client, player1, player2) = setup_test();
    let session_id = 109u32;

    // P1 creates room
    client.create_room(&session_id, &player1, &500_0000000, &true, &zero_hash(&env));

    // P2 joins room → creates game
    client.join_room(&session_id, &player2, &zero_hash(&env));

    // Both commit positions
    let proof = dummy_proof(&env);
    let pubs = dummy_proof(&env);
    client.commit_position(&session_id, &player1, &dummy_commitment(&env, 1), &proof, &pubs);
    client.commit_position(&session_id, &player2, &dummy_commitment(&env, 2), &proof, &pubs);

    // P1 fires, P2 responds hit → equalizer → P2 misses → P1 wins
    client.fire(&session_id, &player1, &3, &3);
    client.respond(&session_id, &player2, &true, &dummy_commitment(&env, 10), &proof, &pubs, &proof, &pubs);
    client.fire(&session_id, &player2, &5, &5);
    client.respond(&session_id, &player1, &false, &dummy_commitment(&env, 20), &proof, &pubs, &proof, &pubs);

    let game = client.get_game(&session_id);
    assert_eq!(game.phase, GamePhase::Finished);
    assert_eq!(game.winner, Some(player1));
}
