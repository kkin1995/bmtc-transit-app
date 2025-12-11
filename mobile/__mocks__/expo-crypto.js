module.exports = {
  getRandomBytesAsync: jest.fn().mockResolvedValue(new Uint8Array(16).fill(0x42)),
  randomUUID: jest.fn().mockReturnValue('550e8400-e29b-41d4-a716-446655440000'),
};
