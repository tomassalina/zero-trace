const CONTRACT_ERRORS: Record<number, string> = {
  1: 'Game not found. It may have expired.',
  2: 'You are not a player in this game.',
  3: 'This game has already ended.',
  4: "It's not your turn right now.",
  5: "This action isn't allowed in the current phase.",
  6: 'You have already committed your position.',
  7: 'Invalid proof submitted. Please try again.',
  8: 'That cell is blocked.',
  9: 'The action timer has expired.',
  10: 'You cannot play against yourself.',
  11: 'Invalid coordinate. Choose a cell within the grid.',
  12: 'Waiting for your opponent to respond.',
  13: 'There is no shot to respond to yet.',
  14: 'Room not found. It may have been cancelled.',
  15: 'A room with this ID already exists.',
  16: 'Incorrect room password.',
  17: 'Only the room creator can do this.',
  18: 'You already fired this round.',
  19: 'You already responded this round.',
  20: 'You are already in an active game.',
};

export function parseContractError(raw: string): string {
  // Match "Error(Contract, #N)" pattern anywhere in the string
  const match = raw.match(/Error\(Contract,\s*#(\d+)\)/);
  if (match) {
    const code = parseInt(match[1], 10);
    if (CONTRACT_ERRORS[code]) return CONTRACT_ERRORS[code];
  }
  // Fallback: match any #N pattern
  const hashMatch = raw.match(/#(\d+)/);
  if (hashMatch) {
    const code = parseInt(hashMatch[1], 10);
    if (CONTRACT_ERRORS[code]) return CONTRACT_ERRORS[code];
  }
  // Strip "Transaction simulation failed:" prefix if present
  if (raw.startsWith('Transaction simulation failed:')) {
    return 'Transaction failed. Please try again.';
  }
  return raw;
}
