import { describeActivity } from './describe-activity';

describe('describeActivity', () => {
  it('writes a login as "<user> logged in", whatever else it is given', () => {
    expect(
      describeActivity({
        username: 'admin',
        action: 'LOGIN',
        entityType: 'User',
        entityId: '1',
        label: 'admin',
      }),
    ).toBe('admin logged in');
  });

  it.each([
    ['CREATE', 'created'],
    ['UPDATE', 'updated'],
    ['DELETE', 'deleted'],
    ['APPROVE', 'approved'],
    ['REJECT', 'rejected'],
    ['RETURN', 'checked in'],
  ])('turns %s into "%s"', (action, verb) => {
    expect(
      describeActivity({ username: 'librarian2', action, entityType: 'Loan' }),
    ).toBe(`librarian2 ${verb} Loan`);
  });

  it('adds the id and the label when it has them', () => {
    expect(
      describeActivity({
        username: 'librarian2',
        action: 'APPROVE',
        entityType: 'Loan',
        entityId: '812',
        label: 'LN-000812',
      }),
    ).toBe('librarian2 approved Loan #812 "LN-000812"');
  });

  it('leaves out a null id and label', () => {
    expect(
      describeActivity({
        username: 'admin',
        action: 'DELETE',
        entityType: 'Book',
        entityId: null,
        label: null,
      }),
    ).toBe('admin deleted Book');
  });

  it('spells out an action it has no verb for in lower case', () => {
    expect(
      describeActivity({
        username: 'admin',
        action: 'MARK_LOST',
        entityType: 'BookCopy',
        entityId: '7',
      }),
    ).toBe('admin mark lost BookCopy #7');
  });
});
