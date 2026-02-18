#![cfg(test)]

use crate::{Error, GamePhase, ZeroTraceContract, ZeroTraceContractClient};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{contract, contractimpl, token, Address, Bytes, BytesN, Env};

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
    pub fn verify_proof(_env: Env, _vk_json: Bytes, _proof_blob: Bytes) -> BytesN<32> {
        BytesN::from_array(&_env, &[0u8; 32])
    }
}

// ============================================================================
// Helpers
// ============================================================================

struct TestEnv {
    env: Env,
    client: ZeroTraceContractClient<'static>,
    admin: Address,
    player1: Address,
    player2: Address,
    token_addr: Address,
}

const INITIAL_BALANCE: i128 = 1_000_0000000; // 1000 XLM in stroops
const STAKE: i128 = 50_0000000; // 50 XLM

fn setup_test() -> TestEnv {
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

    // Create native token (SAC)
    let token_admin = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
    let sac_client = token::StellarAssetClient::new(&env, &token_addr);
    let token_client = token::Client::new(&env, &token_addr);

    let contract_id = env.register(ZeroTraceContract, (&admin, &hub_addr, &verifier_addr, &token_addr));
    let client = ZeroTraceContractClient::new(&env, &contract_id);

    let dummy_vk = Bytes::from_slice(&env, b"[\"0x01\"]");
    client.set_vk(&0, &dummy_vk);
    client.set_vk(&1, &dummy_vk);
    client.set_vk(&2, &dummy_vk);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    // Fund players
    sac_client.mint(&player1, &INITIAL_BALANCE);
    sac_client.mint(&player2, &INITIAL_BALANCE);

    // Verify initial balances
    assert_eq!(token_client.balance(&player1), INITIAL_BALANCE);
    assert_eq!(token_client.balance(&player2), INITIAL_BALANCE);

    TestEnv { env, client, admin, player1, player2, token_addr }
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

fn token_balance(env: &Env, token_addr: &Address, who: &Address) -> i128 {
    token::Client::new(env, token_addr).balance(who)
}

fn contract_balance(t: &TestEnv) -> i128 {
    let contract_addr = t.client.address.clone();
    token_balance(&t.env, &t.token_addr, &contract_addr)
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

/// Helper: create game and commit both positions, returns game in Firing phase
fn setup_firing_phase(t: &TestEnv, session_id: u32) {
    t.client.create_game(&session_id, &t.player1, &t.player2, &STAKE, &STAKE);
    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);
    t.client.commit_position(&session_id, &t.player1, &dummy_commitment(&t.env, 1), &proof, &pubs);
    t.client.commit_position(&session_id, &t.player2, &dummy_commitment(&t.env, 2), &proof, &pubs);
}

fn set_ledger(env: &Env, seq: u32) {
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 1441065600 + (seq as u64),
        protocol_version: 25,
        sequence_number: seq,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: u32::MAX / 2,
        min_persistent_entry_ttl: u32::MAX / 2,
        max_entry_ttl: u32::MAX / 2,
    });
}

// ============================================================================
// Game Creation Tests
// ============================================================================

#[test]
fn test_create_game() {
    let t = setup_test();
    t.client.create_game(&1, &t.player1, &t.player2, &STAKE, &STAKE);

    let game = t.client.get_game(&1);
    assert_eq!(game.player1, t.player1);
    assert_eq!(game.player2, t.player2);
    assert_eq!(game.phase, GamePhase::Setup);
    assert!(game.winner.is_none());
    assert!(!game.player1_committed);
    assert!(!game.player2_committed);
    assert!(!game.is_draw);

    // Both players should have lost their stake
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE - STAKE);
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player2), INITIAL_BALANCE - STAKE);
    // Contract holds both stakes
    assert_eq!(contract_balance(&t), STAKE * 2);
}

#[test]
fn test_self_play_rejected() {
    let t = setup_test();
    let result = t.client.try_create_game(&1, &t.player1, &t.player1, &STAKE, &STAKE);
    assert_error(&result, Error::SelfPlay);
}

// ============================================================================
// Position Commitment Tests
// ============================================================================

#[test]
fn test_commit_positions() {
    let t = setup_test();
    t.client.create_game(&2, &t.player1, &t.player2, &STAKE, &STAKE);

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);

    t.client.commit_position(&2, &t.player1, &dummy_commitment(&t.env, 1), &proof, &pubs);
    let game = t.client.get_game(&2);
    assert!(game.player1_committed);
    assert!(!game.player2_committed);
    assert_eq!(game.phase, GamePhase::Setup);

    t.client.commit_position(&2, &t.player2, &dummy_commitment(&t.env, 2), &proof, &pubs);
    let game = t.client.get_game(&2);
    assert!(game.player2_committed);
    assert_eq!(game.phase, GamePhase::Firing);
}

#[test]
fn test_cannot_commit_twice() {
    let t = setup_test();
    t.client.create_game(&3, &t.player1, &t.player2, &STAKE, &STAKE);

    let c1 = dummy_commitment(&t.env, 1);
    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);

    t.client.commit_position(&3, &t.player1, &c1, &proof, &pubs);
    let result = t.client.try_commit_position(&3, &t.player1, &c1, &proof, &pubs);
    assert_error(&result, Error::AlreadyCommitted);
}

#[test]
fn test_non_player_cannot_commit() {
    let t = setup_test();
    let non_player = Address::generate(&t.env);
    t.client.create_game(&4, &t.player1, &t.player2, &STAKE, &STAKE);

    let result = t.client.try_commit_position(&4, &non_player, &dummy_commitment(&t.env, 1), &dummy_proof(&t.env), &dummy_proof(&t.env));
    assert_error(&result, Error::NotPlayer);
}

// ============================================================================
// Simultaneous Fire Tests
// ============================================================================

#[test]
fn test_both_players_fire_simultaneously() {
    let t = setup_test();
    setup_firing_phase(&t, 5);

    // P1 fires — still in Firing (waiting for P2)
    t.client.fire(&5, &t.player1, &3, &4);
    let game = t.client.get_game(&5);
    assert_eq!(game.phase, GamePhase::Firing);
    assert!(game.player1_has_shot);
    assert!(!game.player2_has_shot);
    assert_eq!(game.player1_shot_x, 3);
    assert_eq!(game.player1_shot_y, 4);

    // P2 fires — transitions to Responding
    t.client.fire(&5, &t.player2, &1, &2);
    let game = t.client.get_game(&5);
    assert_eq!(game.phase, GamePhase::Responding);
    assert!(game.player1_has_shot);
    assert!(game.player2_has_shot);
    assert_eq!(game.player2_shot_x, 1);
    assert_eq!(game.player2_shot_y, 2);
}

#[test]
fn test_cannot_fire_twice_same_round() {
    let t = setup_test();
    setup_firing_phase(&t, 6);

    t.client.fire(&6, &t.player1, &0, &0);
    let result = t.client.try_fire(&6, &t.player1, &1, &1);
    assert_error(&result, Error::AlreadyFired);
}

#[test]
fn test_cannot_fire_in_setup_phase() {
    let t = setup_test();
    t.client.create_game(&7, &t.player1, &t.player2, &STAKE, &STAKE);

    let result = t.client.try_fire(&7, &t.player1, &0, &0);
    assert_error(&result, Error::InvalidPhase);
}

#[test]
fn test_invalid_coordinate() {
    let t = setup_test();
    setup_firing_phase(&t, 8);

    let result = t.client.try_fire(&8, &t.player1, &6, &0);
    assert_error(&result, Error::InvalidCoordinate);
}

// ============================================================================
// Simultaneous Respond Tests
// ============================================================================

#[test]
fn test_both_miss_next_round() {
    let t = setup_test();
    setup_firing_phase(&t, 10);

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);

    // Both fire
    t.client.fire(&10, &t.player1, &0, &0);
    t.client.fire(&10, &t.player2, &5, &5);

    // P1 responds miss
    t.client.respond(&10, &t.player1, &false, &dummy_commitment(&t.env, 10), &proof, &pubs, &proof, &pubs);
    let game = t.client.get_game(&10);
    assert_eq!(game.phase, GamePhase::Responding);

    // P2 responds miss → next round
    t.client.respond(&10, &t.player2, &false, &dummy_commitment(&t.env, 11), &proof, &pubs, &proof, &pubs);
    let game = t.client.get_game(&10);
    assert_eq!(game.phase, GamePhase::Firing);
    assert_eq!(game.round_number, 1);
    assert_eq!(game.blocked_x.len(), 2);
    assert!(!game.player1_has_shot);
    assert!(!game.player2_has_shot);

    // No money moved yet — still in escrow
    assert_eq!(contract_balance(&t), STAKE * 2);
}

#[test]
fn test_p1_hit_p2_wins() {
    let t = setup_test();
    setup_firing_phase(&t, 11);

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);

    t.client.fire(&11, &t.player1, &0, &0);
    t.client.fire(&11, &t.player2, &3, &3);

    // P1 was hit by P2's shot, P2 was not hit
    t.client.respond(&11, &t.player1, &true, &dummy_commitment(&t.env, 10), &proof, &pubs, &proof, &pubs);
    t.client.respond(&11, &t.player2, &false, &dummy_commitment(&t.env, 11), &proof, &pubs, &proof, &pubs);

    let game = t.client.get_game(&11);
    assert_eq!(game.phase, GamePhase::Finished);
    assert_eq!(game.winner, Some(t.player2.clone()));
    assert!(!game.is_draw);

    // P2 (winner) gets 90% of pot, admin gets 10%
    let total_pot = STAKE * 2;
    let fee = total_pot / 10; // 10%
    let prize = total_pot - fee;
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player2), INITIAL_BALANCE - STAKE + prize);
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.admin), fee);
    // P1 lost their stake
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE - STAKE);
    // Contract balance should be 0
    assert_eq!(contract_balance(&t), 0);
}

#[test]
fn test_p2_hit_p1_wins() {
    let t = setup_test();
    setup_firing_phase(&t, 12);

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);

    t.client.fire(&12, &t.player1, &3, &3);
    t.client.fire(&12, &t.player2, &0, &0);

    // P1 was not hit, P2 was hit by P1's shot
    t.client.respond(&12, &t.player1, &false, &dummy_commitment(&t.env, 10), &proof, &pubs, &proof, &pubs);
    t.client.respond(&12, &t.player2, &true, &dummy_commitment(&t.env, 11), &proof, &pubs, &proof, &pubs);

    let game = t.client.get_game(&12);
    assert_eq!(game.phase, GamePhase::Finished);
    assert_eq!(game.winner, Some(t.player1.clone()));

    // P1 (winner) gets 90% of pot
    let total_pot = STAKE * 2;
    let fee = total_pot / 10;
    let prize = total_pot - fee;
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE - STAKE + prize);
    assert_eq!(contract_balance(&t), 0);
}

#[test]
fn test_both_hit_is_draw() {
    let t = setup_test();
    setup_firing_phase(&t, 13);

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);

    t.client.fire(&13, &t.player1, &3, &3);
    t.client.fire(&13, &t.player2, &0, &0);

    // Both were hit
    t.client.respond(&13, &t.player1, &true, &dummy_commitment(&t.env, 10), &proof, &pubs, &proof, &pubs);
    t.client.respond(&13, &t.player2, &true, &dummy_commitment(&t.env, 11), &proof, &pubs, &proof, &pubs);

    let game = t.client.get_game(&13);
    assert_eq!(game.phase, GamePhase::Finished);
    assert!(game.winner.is_none());
    assert!(game.is_draw);

    // Both players get full refund
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE);
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player2), INITIAL_BALANCE);
    assert_eq!(contract_balance(&t), 0);
}

#[test]
fn test_cannot_respond_twice() {
    let t = setup_test();
    setup_firing_phase(&t, 14);

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);

    t.client.fire(&14, &t.player1, &0, &0);
    t.client.fire(&14, &t.player2, &5, &5);

    t.client.respond(&14, &t.player1, &false, &dummy_commitment(&t.env, 10), &proof, &pubs, &proof, &pubs);
    let result = t.client.try_respond(&14, &t.player1, &false, &dummy_commitment(&t.env, 11), &proof, &pubs, &proof, &pubs);
    assert_error(&result, Error::AlreadyResponded);
}

#[test]
fn test_cannot_respond_in_firing_phase() {
    let t = setup_test();
    setup_firing_phase(&t, 15);

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);

    let result = t.client.try_respond(&15, &t.player1, &false, &dummy_commitment(&t.env, 10), &proof, &pubs, &proof, &pubs);
    assert_error(&result, Error::InvalidPhase);
}

// ============================================================================
// Full Game Flow
// ============================================================================

#[test]
fn test_full_simultaneous_game_p1_wins() {
    let t = setup_test();
    setup_firing_phase(&t, 20);

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);

    // Round 0: both miss
    t.client.fire(&20, &t.player1, &0, &0);
    t.client.fire(&20, &t.player2, &5, &5);
    t.client.respond(&20, &t.player1, &false, &dummy_commitment(&t.env, 10), &proof, &pubs, &proof, &pubs);
    t.client.respond(&20, &t.player2, &false, &dummy_commitment(&t.env, 11), &proof, &pubs, &proof, &pubs);

    let game = t.client.get_game(&20);
    assert_eq!(game.round_number, 1);
    assert_eq!(game.phase, GamePhase::Firing);

    // Round 1: P1 hits P2, P2 misses P1
    t.client.fire(&20, &t.player1, &1, &1);
    t.client.fire(&20, &t.player2, &4, &4);
    t.client.respond(&20, &t.player1, &false, &dummy_commitment(&t.env, 12), &proof, &pubs, &proof, &pubs);
    t.client.respond(&20, &t.player2, &true, &dummy_commitment(&t.env, 13), &proof, &pubs, &proof, &pubs);

    let game = t.client.get_game(&20);
    assert_eq!(game.phase, GamePhase::Finished);
    assert_eq!(game.winner, Some(t.player1.clone()));

    // Verify payouts
    let total_pot = STAKE * 2;
    let fee = total_pot / 10;
    let prize = total_pot - fee;
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE - STAKE + prize);
    assert_eq!(contract_balance(&t), 0);
}

#[test]
fn test_full_simultaneous_game_draw() {
    let t = setup_test();
    setup_firing_phase(&t, 21);

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);

    // Round 0: both hit each other
    t.client.fire(&21, &t.player1, &3, &3);
    t.client.fire(&21, &t.player2, &2, &2);
    t.client.respond(&21, &t.player1, &true, &dummy_commitment(&t.env, 10), &proof, &pubs, &proof, &pubs);
    t.client.respond(&21, &t.player2, &true, &dummy_commitment(&t.env, 11), &proof, &pubs, &proof, &pubs);

    let game = t.client.get_game(&21);
    assert_eq!(game.phase, GamePhase::Finished);
    assert!(game.winner.is_none());
    assert!(game.is_draw);

    // Both refunded
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE);
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player2), INITIAL_BALANCE);
}

// ============================================================================
// Timeout Tests (Phase-Aware)
// ============================================================================

#[test]
fn test_timeout_setup_cancels_game() {
    let t = setup_test();
    t.client.create_game(&30, &t.player1, &t.player2, &STAKE, &STAKE);

    // Only P1 commits
    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);
    t.client.commit_position(&30, &t.player1, &dummy_commitment(&t.env, 1), &proof, &pubs);

    // Advance past setup timeout (36 ledgers)
    set_ledger(&t.env, 140);

    let result = t.client.claim_timeout(&30, &t.player1);
    assert_eq!(result, t.player1);

    let game = t.client.get_game(&30);
    assert_eq!(game.phase, GamePhase::Finished);
    assert!(game.is_draw);

    // Both refunded
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE);
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player2), INITIAL_BALANCE);
    assert_eq!(contract_balance(&t), 0);
}

#[test]
fn test_timeout_firing_winner_is_who_fired() {
    let t = setup_test();
    setup_firing_phase(&t, 31);

    // P1 fires, P2 doesn't
    t.client.fire(&31, &t.player1, &0, &0);

    // Advance past action timeout
    set_ledger(&t.env, 140);

    let winner = t.client.claim_timeout(&31, &t.player1);
    assert_eq!(winner, t.player1);

    let game = t.client.get_game(&31);
    assert_eq!(game.phase, GamePhase::Finished);
    assert_eq!(game.winner, Some(t.player1.clone()));

    // P1 gets 90% of pot
    let total_pot = STAKE * 2;
    let fee = total_pot / 10;
    let prize = total_pot - fee;
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE - STAKE + prize);
    assert_eq!(contract_balance(&t), 0);
}

#[test]
fn test_timeout_responding_winner_is_who_responded() {
    let t = setup_test();
    setup_firing_phase(&t, 32);

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);

    // Both fire
    t.client.fire(&32, &t.player1, &0, &0);
    t.client.fire(&32, &t.player2, &5, &5);

    // P1 responds, P2 doesn't
    t.client.respond(&32, &t.player1, &false, &dummy_commitment(&t.env, 10), &proof, &pubs, &proof, &pubs);

    // Advance past action timeout
    set_ledger(&t.env, 140);

    let winner = t.client.claim_timeout(&32, &t.player1);
    assert_eq!(winner, t.player1);

    let game = t.client.get_game(&32);
    assert_eq!(game.phase, GamePhase::Finished);
    assert_eq!(game.winner, Some(t.player1.clone()));
    assert_eq!(contract_balance(&t), 0);
}

#[test]
fn test_cannot_claim_timeout_if_not_fired() {
    let t = setup_test();
    setup_firing_phase(&t, 33);

    // Neither fires, advance past timeout
    set_ledger(&t.env, 140);

    let result = t.client.try_claim_timeout(&33, &t.player1);
    assert_error(&result, Error::InvalidPhase);
}

#[test]
fn test_cannot_claim_timeout_early() {
    let t = setup_test();
    t.client.create_game(&34, &t.player1, &t.player2, &STAKE, &STAKE);

    let result = t.client.try_claim_timeout(&34, &t.player1);
    assert_error(&result, Error::TimedOut);
}

// ============================================================================
// Edge Cases
// ============================================================================

#[test]
fn test_game_not_found() {
    let t = setup_test();
    let result = t.client.try_get_game(&999);
    assert_error(&result, Error::GameNotFound);
}

#[test]
fn test_cannot_fire_before_commit() {
    let t = setup_test();
    t.client.create_game(&40, &t.player1, &t.player2, &STAKE, &STAKE);

    let result = t.client.try_fire(&40, &t.player1, &0, &0);
    assert_error(&result, Error::InvalidPhase);
}

#[test]
fn test_cannot_fire_after_game_ended() {
    let t = setup_test();
    setup_firing_phase(&t, 41);

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);

    // Quick game: both fire, P2 hit
    t.client.fire(&41, &t.player1, &3, &3);
    t.client.fire(&41, &t.player2, &0, &0);
    t.client.respond(&41, &t.player1, &false, &dummy_commitment(&t.env, 10), &proof, &pubs, &proof, &pubs);
    t.client.respond(&41, &t.player2, &true, &dummy_commitment(&t.env, 11), &proof, &pubs, &proof, &pubs);

    let result = t.client.try_fire(&41, &t.player1, &1, &1);
    assert_error(&result, Error::InvalidPhase);
}

// ============================================================================
// Room System Tests
// ============================================================================

#[test]
fn test_create_public_room() {
    let t = setup_test();
    t.client.create_room(&100, &t.player1, &STAKE, &true, &zero_hash(&t.env));

    let room = t.client.get_room(&100);
    assert_eq!(room.creator, t.player1);
    assert!(room.is_public);

    let public_rooms = t.client.list_public_rooms();
    assert_eq!(public_rooms.len(), 1);

    // Creator's stake is in escrow
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE - STAKE);
    assert_eq!(contract_balance(&t), STAKE);
}

#[test]
fn test_create_private_room() {
    let t = setup_test();
    let password_bytes = Bytes::from_slice(&t.env, &[42u8; 32]);
    let password_hash = BytesN::from_array(&t.env, &t.env.crypto().keccak256(&password_bytes).to_array());

    t.client.create_room(&101, &t.player1, &STAKE, &false, &password_hash);

    let room = t.client.get_room(&101);
    assert!(!room.is_public);

    let public_rooms = t.client.list_public_rooms();
    assert_eq!(public_rooms.len(), 0);

    // Stake in escrow
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE - STAKE);
}

#[test]
fn test_join_public_room() {
    let t = setup_test();
    t.client.create_room(&102, &t.player1, &STAKE, &true, &zero_hash(&t.env));
    t.client.join_room(&102, &t.player2, &zero_hash(&t.env));

    let result = t.client.try_get_room(&102);
    assert_error(&result, Error::RoomNotFound);

    let game = t.client.get_game(&102);
    assert_eq!(game.player1, t.player1);
    assert_eq!(game.player2, t.player2);
    assert_eq!(game.phase, GamePhase::Setup);

    // Both stakes in escrow
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE - STAKE);
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player2), INITIAL_BALANCE - STAKE);
    assert_eq!(contract_balance(&t), STAKE * 2);
}

#[test]
fn test_join_private_room_correct_password() {
    let t = setup_test();
    let password = BytesN::from_array(&t.env, &[42u8; 32]);
    let password_bytes = Bytes::from_slice(&t.env, &[42u8; 32]);
    let password_hash = BytesN::from_array(&t.env, &t.env.crypto().keccak256(&password_bytes).to_array());

    t.client.create_room(&103, &t.player1, &STAKE, &false, &password_hash);
    t.client.join_room(&103, &t.player2, &password);

    let game = t.client.get_game(&103);
    assert_eq!(game.player1, t.player1);
    assert_eq!(game.player2, t.player2);
}

#[test]
fn test_join_private_room_wrong_password() {
    let t = setup_test();
    let password_bytes = Bytes::from_slice(&t.env, &[42u8; 32]);
    let password_hash = BytesN::from_array(&t.env, &t.env.crypto().keccak256(&password_bytes).to_array());

    t.client.create_room(&104, &t.player1, &STAKE, &false, &password_hash);

    let wrong_password = BytesN::from_array(&t.env, &[99u8; 32]);
    let result = t.client.try_join_room(&104, &t.player2, &wrong_password);
    assert_error(&result, Error::WrongPassword);
}

#[test]
fn test_self_join_rejected() {
    let t = setup_test();
    t.client.create_room(&105, &t.player1, &STAKE, &true, &zero_hash(&t.env));

    // Creator tries to join own room → AlreadyInGame (checked before SelfPlay)
    let result = t.client.try_join_room(&105, &t.player1, &zero_hash(&t.env));
    assert_error(&result, Error::AlreadyInGame);
}

#[test]
fn test_cancel_room() {
    let t = setup_test();
    t.client.create_room(&106, &t.player1, &STAKE, &true, &zero_hash(&t.env));

    assert_eq!(t.client.list_public_rooms().len(), 1);
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE - STAKE);

    t.client.cancel_room(&106, &t.player1);

    let result = t.client.try_get_room(&106);
    assert_error(&result, Error::RoomNotFound);
    assert_eq!(t.client.list_public_rooms().len(), 0);

    // Stake refunded
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE);
    assert_eq!(contract_balance(&t), 0);
}

#[test]
fn test_cancel_room_not_creator() {
    let t = setup_test();
    t.client.create_room(&107, &t.player1, &STAKE, &true, &zero_hash(&t.env));

    let result = t.client.try_cancel_room(&107, &t.player2);
    assert_error(&result, Error::NotCreator);
}

#[test]
fn test_list_public_rooms_multiple() {
    let t = setup_test();
    let player3 = Address::generate(&t.env);
    let sac = token::StellarAssetClient::new(&t.env, &t.token_addr);
    sac.mint(&player3, &INITIAL_BALANCE);

    // Each room needs a different creator (AlreadyInGame guard)
    t.client.create_room(&200, &t.player1, &STAKE, &true, &zero_hash(&t.env));
    t.client.create_room(&201, &t.player2, &STAKE, &true, &zero_hash(&t.env));
    t.client.create_room(&202, &player3, &STAKE, &false, &zero_hash(&t.env));

    let public_rooms = t.client.list_public_rooms();
    assert_eq!(public_rooms.len(), 2);
}

#[test]
fn test_room_already_exists() {
    let t = setup_test();
    t.client.create_room(&108, &t.player1, &STAKE, &true, &zero_hash(&t.env));

    // Different player tries same session_id → RoomAlreadyExists
    let result = t.client.try_create_room(&108, &t.player2, &STAKE, &true, &zero_hash(&t.env));
    assert_error(&result, Error::RoomAlreadyExists);
}

// ============================================================================
// Room Expiry Tests
// ============================================================================

#[test]
fn test_join_expired_room() {
    let t = setup_test();
    t.client.create_room(&110, &t.player1, &STAKE, &true, &zero_hash(&t.env));

    // Advance past room timeout (120 ledgers)
    set_ledger(&t.env, 225);

    let result = t.client.try_join_room(&110, &t.player2, &zero_hash(&t.env));
    assert_error(&result, Error::RoomNotFound);

    // Stake is still escrowed until creator cancels or list_public_rooms prunes
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE - STAKE);

    // Creator cancels to get refund (works even after expiry)
    t.client.cancel_room(&110, &t.player1);
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE);
}

#[test]
fn test_list_public_rooms_prunes_expired() {
    let t = setup_test();
    // Each room needs a different creator (AlreadyInGame guard)
    t.client.create_room(&111, &t.player1, &STAKE, &true, &zero_hash(&t.env));
    t.client.create_room(&112, &t.player2, &STAKE, &true, &zero_hash(&t.env));

    // Advance past room timeout
    set_ledger(&t.env, 225);

    let public_rooms = t.client.list_public_rooms();
    assert_eq!(public_rooms.len(), 0);

    // Both creators refunded
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE);
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player2), INITIAL_BALANCE);
}

// ============================================================================
// Full Room-to-Game Flow
// ============================================================================

#[test]
fn test_full_room_to_game_flow() {
    let t = setup_test();
    t.client.create_room(&109, &t.player1, &STAKE, &true, &zero_hash(&t.env));
    t.client.join_room(&109, &t.player2, &zero_hash(&t.env));

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);
    t.client.commit_position(&109, &t.player1, &dummy_commitment(&t.env, 1), &proof, &pubs);
    t.client.commit_position(&109, &t.player2, &dummy_commitment(&t.env, 2), &proof, &pubs);

    // Both fire, P2 gets hit
    t.client.fire(&109, &t.player1, &3, &3);
    t.client.fire(&109, &t.player2, &5, &5);
    t.client.respond(&109, &t.player1, &false, &dummy_commitment(&t.env, 10), &proof, &pubs, &proof, &pubs);
    t.client.respond(&109, &t.player2, &true, &dummy_commitment(&t.env, 11), &proof, &pubs, &proof, &pubs);

    let game = t.client.get_game(&109);
    assert_eq!(game.phase, GamePhase::Finished);
    assert_eq!(game.winner, Some(t.player1.clone()));

    // Verify payouts: P1 wins 90% of 100 XLM pot
    let total_pot = STAKE * 2;
    let prize = total_pot - total_pot / 10;
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE - STAKE + prize);
    assert_eq!(contract_balance(&t), 0);
}

// ============================================================================
// Active Game Tracking Tests
// ============================================================================

#[test]
fn test_already_in_game_room() {
    let t = setup_test();
    t.client.create_room(&300, &t.player1, &STAKE, &true, &zero_hash(&t.env));

    // Player1 tries to create another room → AlreadyInGame
    let result = t.client.try_create_room(&301, &t.player1, &STAKE, &true, &zero_hash(&t.env));
    assert_error(&result, Error::AlreadyInGame);
}

#[test]
fn test_already_in_game_join() {
    let t = setup_test();
    let player3 = Address::generate(&t.env);
    let sac = token::StellarAssetClient::new(&t.env, &t.token_addr);
    sac.mint(&player3, &INITIAL_BALANCE);

    // Player2 creates a room, player3 creates another
    t.client.create_room(&302, &t.player2, &STAKE, &true, &zero_hash(&t.env));
    t.client.create_room(&303, &player3, &STAKE, &true, &zero_hash(&t.env));

    // Player1 joins player2's room
    t.client.join_room(&302, &t.player1, &zero_hash(&t.env));

    // Player1 tries to join player3's room → AlreadyInGame
    let result = t.client.try_join_room(&303, &t.player1, &zero_hash(&t.env));
    assert_error(&result, Error::AlreadyInGame);
}

#[test]
fn test_active_game_cleared_on_finish() {
    let t = setup_test();
    t.client.create_room(&304, &t.player1, &STAKE, &true, &zero_hash(&t.env));
    t.client.join_room(&304, &t.player2, &zero_hash(&t.env));

    // Verify active game is set
    assert_eq!(t.client.get_active_game(&t.player1), Some(304));
    assert_eq!(t.client.get_active_game(&t.player2), Some(304));

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);
    t.client.commit_position(&304, &t.player1, &dummy_commitment(&t.env, 1), &proof, &pubs);
    t.client.commit_position(&304, &t.player2, &dummy_commitment(&t.env, 2), &proof, &pubs);

    // Quick game: both fire, P2 hit
    t.client.fire(&304, &t.player1, &3, &3);
    t.client.fire(&304, &t.player2, &0, &0);
    t.client.respond(&304, &t.player1, &false, &dummy_commitment(&t.env, 10), &proof, &pubs, &proof, &pubs);
    t.client.respond(&304, &t.player2, &true, &dummy_commitment(&t.env, 11), &proof, &pubs, &proof, &pubs);

    // Active game cleared → both can create new rooms
    assert_eq!(t.client.get_active_game(&t.player1), None);
    assert_eq!(t.client.get_active_game(&t.player2), None);
    t.client.create_room(&305, &t.player1, &STAKE, &true, &zero_hash(&t.env));
    t.client.create_room(&306, &t.player2, &STAKE, &true, &zero_hash(&t.env));
}

#[test]
fn test_active_game_cleared_on_cancel() {
    let t = setup_test();
    t.client.create_room(&307, &t.player1, &STAKE, &true, &zero_hash(&t.env));

    assert_eq!(t.client.get_active_game(&t.player1), Some(307));

    t.client.cancel_room(&307, &t.player1);

    // Active game cleared → can create a new room
    assert_eq!(t.client.get_active_game(&t.player1), None);
    t.client.create_room(&308, &t.player1, &STAKE, &true, &zero_hash(&t.env));
}

#[test]
fn test_active_game_cleared_on_timeout() {
    let t = setup_test();
    setup_firing_phase(&t, 309);

    // P1 fires, P2 doesn't
    t.client.fire(&309, &t.player1, &0, &0);
    set_ledger(&t.env, 140);

    t.client.claim_timeout(&309, &t.player1);

    // Both can now create rooms
    assert_eq!(t.client.get_active_game(&t.player1), None);
    assert_eq!(t.client.get_active_game(&t.player2), None);
    t.client.create_room(&310, &t.player1, &STAKE, &true, &zero_hash(&t.env));
    t.client.create_room(&311, &t.player2, &STAKE, &true, &zero_hash(&t.env));
}

// ============================================================================
// Max Rounds Draw Test
// ============================================================================

#[test]
fn test_max_rounds_draw() {
    let t = setup_test();
    setup_firing_phase(&t, 400);

    let proof = dummy_proof(&t.env);
    let pubs = dummy_proof(&t.env);

    // Play 36 rounds of both missing
    for round in 0u32..36 {
        let x1 = round % 6;
        let y1 = round / 6;
        let x2 = 5 - (round % 6);
        let y2 = 5 - (round / 6);

        t.client.fire(&400, &t.player1, &x1, &y1);
        t.client.fire(&400, &t.player2, &x2, &y2);

        let seed1 = (round * 2 + 10) as u8;
        let seed2 = (round * 2 + 11) as u8;
        t.client.respond(&400, &t.player1, &false, &dummy_commitment(&t.env, seed1), &proof, &pubs, &proof, &pubs);
        t.client.respond(&400, &t.player2, &false, &dummy_commitment(&t.env, seed2), &proof, &pubs, &proof, &pubs);
    }

    let game = t.client.get_game(&400);
    assert_eq!(game.phase, GamePhase::Finished);
    assert!(game.winner.is_none());
    assert!(game.is_draw);
    assert_eq!(game.round_number, 36);

    // Both refunded on max rounds draw
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player1), INITIAL_BALANCE);
    assert_eq!(token_balance(&t.env, &t.token_addr, &t.player2), INITIAL_BALANCE);
    assert_eq!(contract_balance(&t), 0);
}
