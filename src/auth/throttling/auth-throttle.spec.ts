import { emailTracker } from './auth-throttle';

describe('emailTracker', () => {
  it('tracks by normalized email, so letter case does not reset the count', () => {
    expect(
      emailTracker({
        body: { email: '  Good.Student@Demo.com ' },
        ip: '1.2.3.4',
      }),
    ).toBe('email:good.student@demo.com');
  });

  it.each([
    {},
    { email: '' },
    { email: '   ' },
    { email: 42 },
    { email: ['a@b.c'] },
  ])('falls back to the IP when the body email is %j', (body) => {
    expect(emailTracker({ body, ip: '1.2.3.4' })).toBe('ip:1.2.3.4');
  });

  it('caps the key length', () => {
    expect(
      emailTracker({ body: { email: `${'a'.repeat(1000)}@x.com` } }).length,
    ).toBe('email:'.length + 255);
  });
});
