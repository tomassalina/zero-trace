/// Poseidon2 sponge hash: 3 Field elements -> 1 Field
fn poseidon2_hash(a: Field, b: Field, c: Field) -> Field {
    let state = std::hash::poseidon2_permutation([a, b, c, 0], 4);
    state[0]
}

/// Proves that a player's initial position is valid on a 6x6 grid
/// without revealing the actual position.
///
/// Private inputs: x, y coordinates and a random salt
/// Public output: Poseidon2 hash commitment of (x, y, salt)
fn main(
    x: u8,                   // private: x coordinate (0-5)
    y: u8,                   // private: y coordinate (0-5)
    salt: Field,             // private: random salt for hiding
    commitment: pub Field,   // public: expected Poseidon2 hash
) {
    // Position must be within 6x6 grid
    assert(x < 6, "x coordinate out of bounds");
    assert(y < 6, "y coordinate out of bounds");

    // Verify commitment = Poseidon2(x, y, salt)
    let computed = poseidon2_hash(x as Field, y as Field, salt);
    assert(commitment == computed, "commitment mismatch");
}

#[test]
fn test_valid_position() {
    let x: u8 = 3;
    let y: u8 = 4;
    let salt: Field = 12345;
    let commitment = poseidon2_hash(x as Field, y as Field, salt);
    main(x, y, salt, commitment);
}

#[test(should_fail_with = "x coordinate out of bounds")]
fn test_invalid_x() {
    let salt: Field = 12345;
    let commitment = poseidon2_hash(6 as Field, 0 as Field, salt);
    main(6, 0, salt, commitment);
}

#[test(should_fail_with = "y coordinate out of bounds")]
fn test_invalid_y() {
    let salt: Field = 12345;
    let commitment = poseidon2_hash(0 as Field, 6 as Field, salt);
    main(0, 6, salt, commitment);
}
