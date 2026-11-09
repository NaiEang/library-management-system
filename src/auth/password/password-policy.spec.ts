import { checkPasswordPolicy } from './password-policy';

const ok = (password: string, context = {}) =>
  expect(checkPasswordPolicy(password, context)).toEqual([]);
const rejects = (password: string, rule: RegExp, context = {}) =>
  expect(checkPasswordPolicy(password, context).join(' | ')).toMatch(rule);

describe('checkPasswordPolicy', () => {
  describe('length (8–128, counted in characters, not bytes)', () => {
    it('rejects 7 characters and accepts 8', () => {
      rejects('xk7#pq2', /at least 8/);
      ok('xk7#pq2m');
    });

    it('accepts 128 characters and rejects 129', () => {
      ok('ab3$'.repeat(32));
      rejects('ab3$'.repeat(32) + 'x', /at most 128/);
    });

    it('counts an emoji as one character', () => {
      ok('🔒🦊🌙🎲🧭🍉🚲🎈');
      rejects('🔒🦊🌙🎲🧭🍉🚲', /at least 8/);
    });
  });

  it('allows spaces and has no composition rules', () => {
    ok('correct horse battery staple');
    ok('onlylowercaseletters');
  });

  it.each([
    'password',
    'Password',
    'PASSWORD',
    '12345678',
    'iloveyou',
    ' password ',
  ])('rejects the common password "%s" (case-insensitive)', (password) =>
    rejects(password, /too common/),
  );

  it.each([
    'LibraFlow',
    'libraflow2026!',
    'library123',
    'change-me',
    'Change-Me!!',
  ])('rejects the service-specific word "%s"', (password) =>
    rejects(password, /too common/),
  );

  it('accepts a longer phrase that merely contains a service word', () =>
    ok('my libraflow reading list'));

  describe('personal values', () => {
    const context = { email: 'Good.Student@Demo.com', username: 'goodstudent' };

    it('rejects the email, in any letter case', () => {
      rejects('good.student@demo.com', /email or username/, context);
      rejects('GOOD.STUDENT@DEMO.COM', /email or username/, context);
    });

    it("rejects the email's local part", () =>
      rejects('Good.Student', /email or username/, context));

    it('rejects the username', () =>
      rejects('GoodStudent', /email or username/, context));

    it('accepts a password that only contains the username', () =>
      ok('goodstudent-likes-tea', context));
  });

  it('reports every broken rule at once', () => {
    expect(checkPasswordPolicy('abc', { username: 'abc' })).toHaveLength(2);
  });
});
