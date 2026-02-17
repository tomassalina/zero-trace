#![no_std]

//! Mock ZK Verifier for testing/testnet. Always returns a dummy proof ID.
//! Interface matches UltraHonk verifier: verify_proof(vk_json, proof_blob) -> BytesN<32>

use soroban_sdk::{contract, contractimpl, Bytes, BytesN, Env};

#[contract]
pub struct MockZkVerifier;

#[contractimpl]
impl MockZkVerifier {
    pub fn verify_proof(_env: Env, _vk_json: Bytes, _proof_blob: Bytes) -> BytesN<32> {
        // Return a dummy proof ID (all ones)
        BytesN::from_array(&_env, &[1u8; 32])
    }
}
