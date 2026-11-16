import type { Repository } from 'typeorm';
import type { Member } from '../members/entities/member.entity';
import type { MembershipService } from '../members/membership.service';
import { ExternalService } from './external.service';

const activeMember = {
  id: '1',
  blockedUntil: null,
  user: { email: 'student@example.com' },
};

function setup(memberRow: unknown = activeMember, canBorrow = true) {
  const members = {
    findOne: vi.fn(() => Promise.resolve(memberRow)),
  };
  const membership = {
    canBorrow: vi.fn(() => Promise.resolve(canBorrow)),
  };
  const service = new ExternalService(
    members as unknown as Repository<Member>,
    membership as unknown as MembershipService,
  );
  return { service, members, membership };
}

describe('ExternalService.checkEligibility', () => {
  it('returns canBookSpace true for an active, unblocked member', async () => {
    const { service } = setup();
    const result = await service.checkEligibility('student@example.com');

    expect(result).toEqual({
      email: 'student@example.com',
      isRegistered: true,
      canBookSpace: true,
      reason: null,
    });
  });

  it('returns not registered when the email is not found', async () => {
    const { service } = setup(null);
    const result = await service.checkEligibility('unknown@example.com');

    expect(result).toEqual({
      email: 'unknown@example.com',
      isRegistered: false,
      canBookSpace: false,
      reason: 'Not a library member',
    });
  });

  it('returns blocked when blockedUntil is in the future', async () => {
    const blocked = {
      ...activeMember,
      blockedUntil: new Date(Date.now() + 86_400_000),
    };
    const { service } = setup(blocked);
    const result = await service.checkEligibility('student@example.com');

    expect(result).toEqual({
      email: 'student@example.com',
      isRegistered: true,
      canBookSpace: false,
      reason: 'Account blocked due to overdue books',
    });
  });

  it('returns membership not active when canBorrow is false', async () => {
    const { service } = setup(activeMember, false);
    const result = await service.checkEligibility('student@example.com');

    expect(result).toEqual({
      email: 'student@example.com',
      isRegistered: true,
      canBookSpace: false,
      reason: 'Membership not active',
    });
  });

  it('normalizes the email to lowercase and trimmed', async () => {
    const { service, members } = setup();
    await service.checkEligibility('  Student@Example.COM  ');

    expect(members.findOne).toHaveBeenCalledWith({
      where: { user: { email: 'student@example.com' } },
      relations: { user: true },
    });
  });
});
