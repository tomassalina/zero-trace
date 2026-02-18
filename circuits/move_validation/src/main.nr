/// Poseidon2 sponge hash: 3 Field elements -> 1 Field
fn poseidon2_hash(a: Field, b: Field, c: Field) -> Field {
    let state = std::hash::poseidon2_permutation([a, b, c, 0], 4);
    state[0]
}

/// Proves that a player moved to a valid adjacent cell on the 6x6 grid
/// without revealing either the old or new position.
///
/// The move must be to an adjacent cell (Chebyshev distance exactly 1,
/// i.e. like a chess king -- including diagonals) and the new cell must
/// not be blocked (previously attacked).
///
/// blocked_cells is a flat array: [x0, y0, x1, y1, ...] padded with 255s.
/// num_blocked tells how many valid (x,y) pairs there are.
fn main(
    old_x: u8,                      // private: previous x
    old_y: u8,                      // private: previous y
    old_salt: Field,                // private: previous salt
    new_x: u8,                     // private: new x
    new_y: u8,                     // private: new y
    new_salt: Field,               // private: new salt (fresh randomness)
    old_commitment: pub Field,     // public: previous position commitment
    new_commitment: pub Field,     // public: new position commitment
    blocked_cells: pub [u8; 72],   // public: flat array of blocked (x,y) pairs, max 36
    num_blocked: pub u8,           // public: number of blocked cells
) {
    // Verify old commitment
    let computed_old = poseidon2_hash(old_x as Field, old_y as Field, old_salt);
    assert(old_commitment == computed_old, "old commitment mismatch");

    // Verify new commitment
    let computed_new = poseidon2_hash(new_x as Field, new_y as Field, new_salt);
    assert(new_commitment == computed_new, "new commitment mismatch");

    // New position must be on the 6x6 grid
    assert(new_x < 6, "new x out of bounds");
    assert(new_y < 6, "new y out of bounds");

    // Must move to adjacent cell (Chebyshev distance exactly 1 -- king move)
    let dx = if new_x > old_x { new_x - old_x } else { old_x - new_x };
    let dy = if new_y > old_y { new_y - old_y } else { old_y - new_y };
    assert(dx <= 1, "must move at most one step in x");
    assert(dy <= 1, "must move at most one step in y");
    assert(dx + dy > 0, "must move at least one step");

    // New position must not be a blocked cell
    for i in 0..36 {
        if (i as u8) < num_blocked {
            let bx = blocked_cells[i * 2];
            let by = blocked_cells[i * 2 + 1];
            let is_this_cell = (new_x == bx) & (new_y == by);
            assert(!is_this_cell, "cannot move to blocked cell");
        }
    }
}

#[test]
fn test_valid_move_right() {
    let old_x: u8 = 2;
    let old_y: u8 = 3;
    let old_salt: Field = 111;
    let new_x: u8 = 3;
    let new_y: u8 = 3;
    let new_salt: Field = 222;

    let old_commitment = poseidon2_hash(old_x as Field, old_y as Field, old_salt);
    let new_commitment = poseidon2_hash(new_x as Field, new_y as Field, new_salt);

    let blocked: [u8; 72] = [255; 72];
    main(old_x, old_y, old_salt, new_x, new_y, new_salt, old_commitment, new_commitment, blocked, 0);
}

#[test]
fn test_valid_move_up() {
    let old_x: u8 = 2;
    let old_y: u8 = 3;
    let old_salt: Field = 111;
    let new_x: u8 = 2;
    let new_y: u8 = 4;
    let new_salt: Field = 333;

    let old_commitment = poseidon2_hash(old_x as Field, old_y as Field, old_salt);
    let new_commitment = poseidon2_hash(new_x as Field, new_y as Field, new_salt);

    let blocked: [u8; 72] = [255; 72];
    main(old_x, old_y, old_salt, new_x, new_y, new_salt, old_commitment, new_commitment, blocked, 0);
}

#[test]
fn test_valid_move_diagonal() {
    let old_x: u8 = 2;
    let old_y: u8 = 3;
    let old_salt: Field = 111;
    let new_x: u8 = 3;
    let new_y: u8 = 4;
    let new_salt: Field = 222;

    let old_commitment = poseidon2_hash(old_x as Field, old_y as Field, old_salt);
    let new_commitment = poseidon2_hash(new_x as Field, new_y as Field, new_salt);

    let blocked: [u8; 72] = [255; 72];
    main(old_x, old_y, old_salt, new_x, new_y, new_salt, old_commitment, new_commitment, blocked, 0);
}

#[test]
fn test_valid_move_diagonal_down_left() {
    let old_x: u8 = 2;
    let old_y: u8 = 3;
    let old_salt: Field = 111;
    let new_x: u8 = 1;
    let new_y: u8 = 2;
    let new_salt: Field = 444;

    let old_commitment = poseidon2_hash(old_x as Field, old_y as Field, old_salt);
    let new_commitment = poseidon2_hash(new_x as Field, new_y as Field, new_salt);

    let blocked: [u8; 72] = [255; 72];
    main(old_x, old_y, old_salt, new_x, new_y, new_salt, old_commitment, new_commitment, blocked, 0);
}

#[test(should_fail_with = "must move at least one step")]
fn test_no_move() {
    let old_x: u8 = 2;
    let old_y: u8 = 3;
    let old_salt: Field = 111;
    let new_x: u8 = 2;
    let new_y: u8 = 3;
    let new_salt: Field = 222;

    let old_commitment = poseidon2_hash(old_x as Field, old_y as Field, old_salt);
    let new_commitment = poseidon2_hash(new_x as Field, new_y as Field, new_salt);

    let blocked: [u8; 72] = [255; 72];
    main(old_x, old_y, old_salt, new_x, new_y, new_salt, old_commitment, new_commitment, blocked, 0);
}

#[test(should_fail_with = "must move at most one step")]
fn test_two_steps() {
    let old_x: u8 = 2;
    let old_y: u8 = 3;
    let old_salt: Field = 111;
    let new_x: u8 = 4;
    let new_y: u8 = 3;
    let new_salt: Field = 222;

    let old_commitment = poseidon2_hash(old_x as Field, old_y as Field, old_salt);
    let new_commitment = poseidon2_hash(new_x as Field, new_y as Field, new_salt);

    let blocked: [u8; 72] = [255; 72];
    main(old_x, old_y, old_salt, new_x, new_y, new_salt, old_commitment, new_commitment, blocked, 0);
}

#[test(should_fail_with = "cannot move to blocked cell")]
fn test_move_to_blocked() {
    let old_x: u8 = 2;
    let old_y: u8 = 3;
    let old_salt: Field = 111;
    let new_x: u8 = 3;
    let new_y: u8 = 3;
    let new_salt: Field = 222;

    let old_commitment = poseidon2_hash(old_x as Field, old_y as Field, old_salt);
    let new_commitment = poseidon2_hash(new_x as Field, new_y as Field, new_salt);

    // Block cell (3, 3)
    let mut blocked: [u8; 72] = [255; 72];
    blocked[0] = 3;
    blocked[1] = 3;
    main(old_x, old_y, old_salt, new_x, new_y, new_salt, old_commitment, new_commitment, blocked, 1);
}

#[test(should_fail_with = "cannot move to blocked cell")]
fn test_diagonal_move_to_blocked() {
    let old_x: u8 = 2;
    let old_y: u8 = 3;
    let old_salt: Field = 111;
    let new_x: u8 = 3;
    let new_y: u8 = 4;
    let new_salt: Field = 222;

    let old_commitment = poseidon2_hash(old_x as Field, old_y as Field, old_salt);
    let new_commitment = poseidon2_hash(new_x as Field, new_y as Field, new_salt);

    // Block cell (3, 4)
    let mut blocked: [u8; 72] = [255; 72];
    blocked[0] = 3;
    blocked[1] = 4;
    main(old_x, old_y, old_salt, new_x, new_y, new_salt, old_commitment, new_commitment, blocked, 1);
}
