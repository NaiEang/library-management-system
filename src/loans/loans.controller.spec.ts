import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth-user';
import { RoleName } from '../common/constants';
import { borrowerFor } from './loans.controller';

const member: AuthUser = { id: '3', username: 'm', role: RoleName.MEMBER, memberId: '1' };
const librarian: AuthUser = { id: '2', username: 'l', role: RoleName.LIBRARIAN };

describe('borrowerFor', () => {
  it('puts a member’s request on their own account', () => {
    expect(borrowerFor(member)).toBe('1');
    expect(borrowerFor(member, '1')).toBe('1');
  });

  it('refuses a member borrowing on someone else’s account', () => {
    expect(() => borrowerFor(member, '2')).toThrow(ForbiddenException);
  });

  it('uses the member staff name', () => {
    expect(borrowerFor(librarian, '2')).toBe('2');
  });

  it('asks staff to name the member', () => {
    expect(() => borrowerFor(librarian)).toThrow(BadRequestException);
  });
});
