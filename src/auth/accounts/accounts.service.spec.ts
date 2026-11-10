import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { RoleName } from '../../common/constants';
import { User } from '../../users/entities/user.entity';
import { PasswordService } from '../password/password.service';
import { RefreshTokenService } from '../tokens/refresh-token.service';
import { AccountsService } from './accounts.service';

const admin = { id: '1', username: 'admin', role: RoleName.ADMIN };
const librarian = { id: '2', username: 'desk', role: RoleName.LIBRARIAN };
const managerActor = { id: '8', username: 'campus', role: RoleName.MANAGER };

function setup({
  target = null as Record<string, unknown> | null,
  activeAdmins = 2,
} = {}) {
  const query = {
    innerJoinAndSelect: vi.fn().mockReturnThis(),
    setLock: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOne: vi.fn(() => Promise.resolve(target)),
    select: vi.fn().mockReturnThis(),
    getMany: vi.fn(() =>
      Promise.resolve(
        Array.from({ length: activeAdmins }, (_, i) => ({ id: String(i) })),
      ),
    ),
  };
  const manager = {
    createQueryBuilder: vi.fn(() => query),
    update: vi.fn(() => Promise.resolve({ affected: 1 })),
  };
  const users = {
    findOne: vi.fn(() => Promise.resolve(target)),
    manager: {
      transaction: vi.fn((work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
      ),
    },
  };
  const refreshTokens = { revokeAllForUser: vi.fn(() => Promise.resolve(3)) };
  const passwordService = {
    hash: vi.fn((password: string) => Promise.resolve(`hashed:${password}`)),
  };
  const service = new AccountsService(
    users as unknown as Repository<User>,
    refreshTokens as unknown as RefreshTokenService,
    passwordService as unknown as PasswordService,
  );
  return { service, manager, users, refreshTokens, passwordService, query };
}

const member = {
  id: '5',
  username: 'member',
  roleId: 3,
  status: 'active',
  role: { name: RoleName.MEMBER },
};
const otherAdmin = {
  id: '7',
  username: 'admin2',
  roleId: 1,
  status: 'active',
  role: { name: RoleName.ADMIN },
};

describe('AccountsService.setStatus', () => {
  it('disables a member and ends all of their sessions in the same transaction', async () => {
    const { service, manager, refreshTokens } = setup({ target: member });
    await expect(service.setStatus('5', false, admin)).resolves.toEqual({
      id: '5',
      username: 'member',
      role: 'member',
      status: 'disabled',
    });
    expect(manager.update).toHaveBeenCalledWith(
      User,
      { id: '5' },
      { status: 'disabled' },
    );
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('5', manager);
  });

  it('re-enabling also ends all sessions', async () => {
    const { service, refreshTokens } = setup({
      target: { ...member, status: 'disabled' },
    });
    await expect(service.setStatus('5', true, admin)).resolves.toMatchObject({
      status: 'active',
    });
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalled();
  });

  it('an admin cannot change their own status → 403, before touching the database', async () => {
    const { service, users } = setup({ target: otherAdmin });
    await expect(service.setStatus('1', false, admin)).rejects.toThrow(
      ForbiddenException,
    );
    expect(users.manager.transaction).not.toHaveBeenCalled();
  });

  it('the last active admin cannot be disabled → 409, nothing written', async () => {
    const { service, manager, refreshTokens } = setup({
      target: otherAdmin,
      activeAdmins: 1,
    });
    await expect(service.setStatus('7', false, admin)).rejects.toThrow(
      ConflictException,
    );
    expect(manager.update).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('another admin can be disabled while a second one stays active', async () => {
    const { service, query } = setup({ target: otherAdmin, activeAdmins: 2 });
    await expect(service.setStatus('7', false, admin)).resolves.toMatchObject({
      status: 'disabled',
    });
    expect(query.setLock).toHaveBeenCalledWith('pessimistic_write');
  });

  it('an unknown user → 404', async () => {
    await expect(setup().service.setStatus('99', false, admin)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('AccountsService.resetPassword', () => {
  it('sets a random 12-character temporary password, hashed, and ends all sessions', async () => {
    const { service, manager, refreshTokens, passwordService } = setup({
      target: member,
    });
    const result = await service.resetPassword('5', librarian);
    expect(result.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(passwordService.hash).toHaveBeenCalledWith(result.temporaryPassword);
    expect(manager.update).toHaveBeenCalledWith(
      User,
      { id: '5' },
      { passwordHash: `hashed:${result.temporaryPassword}` },
    );
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('5', manager);
  });

  it('never gives the same temporary password twice', async () => {
    const { service } = setup({ target: member });
    const passwords = await Promise.all(
      Array.from({ length: 20 }, () => service.resetPassword('5', admin)),
    );
    expect(new Set(passwords.map((p) => p.temporaryPassword)).size).toBe(20);
  });

  it.each([
    ['an admin', otherAdmin],
    ['a librarian', { ...member, id: '6', role: { name: RoleName.LIBRARIAN } }],
  ])('a librarian cannot reset %s → 403', async (_label, target) => {
    const { service, manager } = setup({ target });
    await expect(
      service.resetPassword(String(target.id), librarian),
    ).rejects.toThrow(ForbiddenException);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('an admin can reset a librarian', async () => {
    const { service } = setup({
      target: { ...member, id: '6', role: { name: RoleName.LIBRARIAN } },
    });
    await expect(service.resetPassword('6', admin)).resolves.toMatchObject({
      id: '6',
    });
  });

  it('nobody resets their own password this way → 400', async () => {
    await expect(
      setup({ target: otherAdmin }).service.resetPassword('1', admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('an unknown user → 404', async () => {
    await expect(setup().service.resetPassword('99', admin)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('Manager rules (admin minus admin powers)', () => {
  const librarianTarget = {
    ...member,
    id: '6',
    role: { name: RoleName.LIBRARIAN },
  };
  const managerTarget = {
    ...member,
    id: '9',
    role: { name: RoleName.MANAGER },
  };

  it.each([
    ['a member', member],
    ['a librarian', librarianTarget],
  ])(
    'a manager can disable %s and reset its password',
    async (_label, target) => {
      const disable = setup({ target });
      await expect(
        disable.service.setStatus(String(target.id), false, managerActor),
      ).resolves.toMatchObject({
        status: 'disabled',
      });
      const reset = setup({ target });
      await expect(
        reset.service.resetPassword(String(target.id), managerActor),
      ).resolves.toMatchObject({
        id: String(target.id),
      });
    },
  );

  it.each([
    ['another manager', managerTarget],
    ['an admin', otherAdmin],
  ])(
    'a manager cannot disable or reset %s → 403, nothing written',
    async (_label, target) => {
      const disable = setup({ target });
      await expect(
        disable.service.setStatus(String(target.id), false, managerActor),
      ).rejects.toThrow(ForbiddenException);
      expect(disable.manager.update).not.toHaveBeenCalled();
      const reset = setup({ target });
      await expect(
        reset.service.resetPassword(String(target.id), managerActor),
      ).rejects.toThrow(ForbiddenException);
      expect(reset.manager.update).not.toHaveBeenCalled();
    },
  );

  it('an admin can disable a manager', async () => {
    const { service } = setup({ target: managerTarget });
    await expect(service.setStatus('9', false, admin)).resolves.toMatchObject({
      status: 'disabled',
    });
  });

  it('an account with an unknown role is never changed → 403', async () => {
    const { service, manager } = setup({
      target: { ...member, role: { name: 'superuser' } },
    });
    await expect(service.setStatus('5', false, admin)).rejects.toThrow(
      ForbiddenException,
    );
    expect(manager.update).not.toHaveBeenCalled();
  });
});
