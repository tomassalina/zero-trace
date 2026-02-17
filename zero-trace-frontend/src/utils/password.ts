/**
 * Password hashing for private room system.
 * Must match contract's env.crypto().keccak256() behavior.
 */

/** keccak256 using SubtleCrypto is not available — we need a JS implementation.
 *  The contract uses Soroban's env.crypto().keccak256() on 32 bytes.
 *  We'll use a simple keccak256 via the same approach.
 */

// Minimal keccak256 — adapted from @noble/hashes pattern
// We use the Web Crypto API SHA-256 as fallback is not possible for keccak.
// Instead, we implement a tiny keccak256.

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

const ROTC = [
  1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44,
];

const PI = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];

function keccakF(state: bigint[]) {
  const mask64 = (1n << 64n) - 1n;
  for (let round = 0; round < 24; round++) {
    // theta
    const C = Array(5).fill(0n);
    for (let x = 0; x < 5; x++) C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    for (let x = 0; x < 5; x++) {
      const D = C[(x + 4) % 5] ^ (((C[(x + 1) % 5] << 1n) | (C[(x + 1) % 5] >> 63n)) & mask64);
      for (let y = 0; y < 25; y += 5) state[x + y] = (state[x + y] ^ D) & mask64;
    }
    // rho + pi
    let last = state[1];
    for (let i = 0; i < 24; i++) {
      const j = PI[i];
      const temp = state[j];
      const r = BigInt(ROTC[i]);
      state[j] = ((last << r) | (last >> (64n - r))) & mask64;
      last = temp;
    }
    // chi
    for (let y = 0; y < 25; y += 5) {
      const t = [state[y], state[y + 1], state[y + 2], state[y + 3], state[y + 4]];
      for (let x = 0; x < 5; x++) state[y + x] = (t[x] ^ ((~t[(x + 1) % 5] & mask64) & t[(x + 2) % 5])) & mask64;
    }
    // iota
    state[0] = (state[0] ^ RC[round]) & mask64;
  }
}

function keccak256(data: Uint8Array): Uint8Array {
  const rate = 136; // (1600 - 256*2) / 8
  const state = new Array(25).fill(0n);

  // Pad: data || 0x01 || 0x00...0x00 || 0x80
  const padded = new Uint8Array(Math.ceil((data.length + 1) / rate) * rate || rate);
  padded.set(data);
  padded[data.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  // Absorb
  const view = new DataView(padded.buffer);
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate / 8; i++) {
      state[i] ^= view.getBigUint64(offset + i * 8, true);
    }
    keccakF(state);
  }

  // Squeeze (32 bytes)
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) {
    outView.setBigUint64(i * 8, state[i], true);
  }
  return out;
}

/** Hash a password string → 32-byte keccak256, matching contract behavior */
export function hashPassword(password: string): Uint8Array {
  // Contract does: env.crypto().keccak256(&Bytes::from_slice(&env, &password.to_array()))
  // password is BytesN<32>, so we pad the UTF-8 bytes to 32 bytes
  const padded = padPassword(password);
  return keccak256(padded);
}

/** Pad password to 32 bytes (UTF-8, zero-padded) */
export function padPassword(password: string): Uint8Array {
  const bytes = new TextEncoder().encode(password);
  const padded = new Uint8Array(32);
  padded.set(bytes.slice(0, 32));
  return padded;
}

/** Generate a random room password (6 alphanumeric chars) */
export function generateRoomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 for clarity
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

/** Zero hash for public rooms (no password) */
export function zeroHash(): Uint8Array {
  return new Uint8Array(32);
}
