/// Poseidon2 sponge hash: 3 Field elements -> 1 Field
fn poseidon2_hash(a: Field, b: Field, c: Field) -> Field {
    let state = std::hash::poseidon2_permutation([a, b, c, 0], 4);
    state[0]
}

/// Target player proves whether a shot hit or missed their current position
/// without revealing where they actually are.
///
/// Private inputs: actual x, y position and salt
/// Public inputs: current commitment, shot coordinates, and hit/miss result
fn main(
    x: u8,                   // private: my current x position
    y: u8,                   // private: my current y position
    salt: Field,             // private: my current salt
    commitment: pub Field,   // public: my current position commitment
    shot_x: pub u8,          // public: x coordinate of incoming shot
    shot_y: pub u8,          // public: y coordinate of incoming shot
    hit: pub bool,           // public: whether the shot hit me
) {
    // Verify my commitment matches my actual position
    let computed = poseidon2_hash(x as Field, y as Field, salt);
    assert(commitment == computed, "commitment mismatch");

    // Verify the hit/miss claim is truthful
    let is_hit = (x == shot_x) & (y == shot_y);
    assert(hit == is_hit, "hit/miss claim is incorrect");
}

#[test]
fn test_shot_miss() {
    let x: u8 = 3;
    let y: u8 = 4;
    let salt: Field = 99999;
    let commitment = poseidon2_hash(x as Field, y as Field, salt);
    main(x, y, salt, commitment, 1, 1, false);
}

#[test]
fn test_shot_hit() {
    let x: u8 = 3;
    let y: u8 = 4;
    let salt: Field = 99999;
    let commitment = poseidon2_hash(x as Field, y as Field, salt);
    main(x, y, salt, commitment, 3, 4, true);
}

#[test(should_fail_with = "hit/miss claim is incorrect")]
fn test_lying_about_miss() {
    let x: u8 = 3;
    let y: u8 = 4;
    let salt: Field = 99999;
    let commitment = poseidon2_hash(x as Field, y as Field, salt);
    main(x, y, salt, commitment, 3, 4, false);
}

#[test(should_fail_with = "hit/miss claim is incorrect")]
fn test_lying_about_hit() {
    let x: u8 = 3;
    let y: u8 = 4;
    let salt: Field = 99999;
    let commitment = poseidon2_hash(x as Field, y as Field, salt);
    main(x, y, salt, commitment, 0, 0, true);
}
