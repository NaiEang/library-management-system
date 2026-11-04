import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

function setup(user: Partial<User> | null) {
  const repo = {
    findOne: vi.fn(() => Promise.resolve(user)),
    update: vi.fn(() => Promise.resolve({ affected: 1 })),
  };
  return {
    repo,
    service: new UsersService(repo as unknown as Repository<User>),
  };
}

describe('UsersService', () => {
  it('findForLogin looks up the normalized email and selects the hash explicitly', async () => {
    const { repo, service } = setup(null);
    await service.findForLogin('  Good.Student@Demo.COM ');
    const options = (
      repo.findOne.mock.calls[0] as unknown as [
        { where: object; select: { passwordHash: boolean } },
      ]
    )[0];
    expect(options.where).toEqual({ email: 'good.student@demo.com' });
    expect(options.select.passwordHash).toBe(true);
  });

  it('findForAuth never selects the password hash', async () => {
    const { repo, service } = setup(null);
    await service.findForAuth('3');
    const options = (
      repo.findOne.mock.calls[0] as unknown as [
        { select: Record<string, unknown> },
      ]
    )[0];
    expect(options.select.passwordHash).toBeUndefined();
  });

  it('findForLogin flattens role and member', async () => {
    const { service } = setup({
      id: '2',
      email: 'librarian@libraflow.test',
      username: 'lib',
      status: 'active',
      passwordHash: 'h',
      role: { name: 'LIBRARIAN' },
      member: undefined,
    } as unknown as User);
    await expect(
      service.findForLogin('librarian@libraflow.test'),
    ).resolves.toMatchObject({
      roleName: 'LIBRARIAN',
      memberId: null,
      membershipStatus: null,
    });
  });

  it('recordLogin sets last_login_at to now', async () => {
    const { repo, service } = setup(null);
    await service.recordLogin('3');
    expect(repo.update).toHaveBeenCalledWith(
      { id: '3' },
      { lastLoginAt: expect.any(Date) },
    );
  });

  it('findProfile returns null for a missing user', async () => {
    await expect(setup(null).service.findProfile('99')).resolves.toBeNull();
  });
});
