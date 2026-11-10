import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id at m=19456, t=2, p=1', async () => {
    const hash = await service.hash('correct horse battery staple');
    const [, algorithm, version, params] = hash.split('$');
    expect(algorithm).toBe('argon2id');
    expect(version).toBe('v=19');
    // The library decides the order of the parameters, so compare them as a set.
    expect(params.split(',').sort()).toEqual(['m=19456', 'p=1', 't=2']);
  });

  it('never returns the password itself, and salts every hash', async () => {
    const [first, second] = await Promise.all([
      service.hash('same password'),
      service.hash('same password'),
    ]);
    expect(first).not.toContain('same password');
    expect(first).not.toBe(second);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(
      service.verify(hash, 'correct horse battery staple'),
    ).resolves.toBe(true);
    await expect(
      service.verify(hash, 'Correct horse battery staple'),
    ).resolves.toBe(false);
  });

  it.each([
    '',
    'not-a-hash',
    '$2b$10$bcryptLookingHashThatIsNotArgon2..........',
  ])('treats a malformed stored hash (%s) as a mismatch', async (hash) => {
    await expect(service.verify(hash, 'anything')).resolves.toBe(false);
  });
});
