import {
  Controller,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { RoleName } from '../../common/constants';
import type { AuthUser } from '../../auth/types/auth-user';
import type { ActivityLogsService } from '../activity-logs.service';
import { LogActivity } from '../decorators/log-activity.decorator';
import { ActivityLogInterceptor } from './activity-log.interceptor';

@Controller('loans')
class LoansController {
  create() {}
  @LogActivity({ action: 'APPROVE' })
  approve() {}
  @LogActivity({ skip: true })
  writesItsOwnRow() {}
}

@LogActivity({ entityType: 'Fine' })
@Controller('payments')
class PaymentsController {
  create() {}
  @LogActivity({ entityType: 'Deposit' })
  deposit() {}
}

@Controller('categories')
class CategoriesController {
  create() {}
}

@Controller('book-copies')
class BookCopiesController {
  create() {}
}

@Controller('users/librarians')
class LibrariansController {
  create() {}
}

@Controller()
class RootController {
  create() {}
}

type ControllerClass = { prototype: object };

interface FakeRequest {
  method: string;
  user?: AuthUser;
  params?: Record<string, string>;
  ip?: string;
  remoteAddress?: string;
}

const admin: AuthUser = { id: '1', username: 'admin', role: RoleName.ADMIN };
const librarian: AuthUser = {
  id: '2',
  username: 'desk.librarian',
  role: RoleName.LIBRARIAN,
};
const member: AuthUser = {
  id: '3',
  username: 'member.one',
  role: RoleName.MEMBER,
  memberId: '30',
};

function contextFor(
  cls: ControllerClass,
  handler: string,
  { method, user, params = {}, ip, remoteAddress }: FakeRequest,
  type = 'http',
): ExecutionContext {
  const request = {
    method,
    user,
    params,
    ip,
    socket: { remoteAddress },
  };
  return {
    getType: () => type,
    getClass: () => cls,
    getHandler: () => (cls.prototype as Record<string, unknown>)[handler],
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function returning(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe('ActivityLogInterceptor', () => {
  let record: ReturnType<typeof vi.fn>;
  let interceptor: ActivityLogInterceptor;

  beforeEach(() => {
    record = vi.fn(() => Promise.resolve('99'));
    interceptor = new ActivityLogInterceptor(new Reflector(), {
      record,
    } as unknown as ActivityLogsService);
  });

  function run(context: ExecutionContext, result: unknown = { id: '5' }) {
    return lastValueFrom(interceptor.intercept(context, returning(result)));
  }

  it("records a librarian's create with the id, label and IP, and passes the result on", async () => {
    const result = { id: '812', loanCode: 'LN-000812', status: 'pending' };
    const context = contextFor(LoansController, 'create', {
      method: 'POST',
      user: librarian,
      ip: '::ffff:10.0.0.7',
    });

    await expect(run(context, result)).resolves.toBe(result);
    expect(record).toHaveBeenCalledExactlyOnceWith({
      user: librarian,
      action: 'CREATE',
      entityType: 'Loan',
      entityId: '812',
      label: 'LN-000812',
      ipAddress: '10.0.0.7',
    });
  });

  it.each([
    ['PUT', 'UPDATE'],
    ['PATCH', 'UPDATE'],
    ['DELETE', 'DELETE'],
  ])('names a %s an %s', async (method, action) => {
    await run(contextFor(LoansController, 'create', { method, user: admin }));
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ user: admin, action }),
    );
  });

  it('skips reads', async () => {
    await run(
      contextFor(LoansController, 'create', { method: 'GET', user: admin }),
    );
    expect(record).not.toHaveBeenCalled();
  });

  it.each([
    ['a member', member],
    ['an anonymous request', undefined],
  ])('skips %s', async (_, user) => {
    await run(contextFor(LoansController, 'create', { method: 'POST', user }));
    expect(record).not.toHaveBeenCalled();
  });

  it('leaves non-HTTP calls alone', async () => {
    const context = contextFor(
      LoansController,
      'create',
      { method: 'POST', user: admin },
      'rpc',
    );
    await expect(run(context, 'done')).resolves.toBe('done');
    expect(record).not.toHaveBeenCalled();
  });

  it('lets @LogActivity rename the action, and takes the id from the route when the result has none', async () => {
    const context = contextFor(LoansController, 'approve', {
      method: 'PATCH',
      user: librarian,
      params: { id: '812' },
    });
    await run(context, { status: 'approved' });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'APPROVE',
        entityType: 'Loan',
        entityId: '812',
        label: null,
      }),
    );
  });

  it('lets @LogActivity({ skip: true }) opt a handler out', async () => {
    await run(
      contextFor(LoansController, 'writesItsOwnRow', {
        method: 'POST',
        user: admin,
      }),
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('applies a controller-level entity type to every handler, unless the handler overrides it', async () => {
    await run(
      contextFor(PaymentsController, 'create', { method: 'POST', user: admin }),
    );
    await run(
      contextFor(PaymentsController, 'deposit', {
        method: 'POST',
        user: admin,
      }),
    );
    expect(record.mock.calls.map(([entry]) => entry.entityType)).toEqual([
      'Fine',
      'Deposit',
    ]);
  });

  it.each([
    [CategoriesController, 'Category'],
    [BookCopiesController, 'BookCopy'],
    [LibrariansController, 'Librarian'],
    [RootController, 'Resource'],
  ])(
    'derives the entity type from the controller path (%o → %s)',
    async (cls, entityType) => {
      await run(contextFor(cls, 'create', { method: 'POST', user: admin }));
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ entityType }),
      );
    },
  );

  it.each([
    [{ id: 7 }, '7'],
    [null, '3'],
    ['ok', '3'],
    [{ id: { nested: true } }, '3'],
  ])('turns the result %o into entity id %s', async (result, entityId) => {
    const context = contextFor(LoansController, 'create', {
      method: 'DELETE',
      user: admin,
      params: { id: '3' },
    });
    await run(context, result);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ entityId }));
  });

  it.each([
    [{ name: 'Fiction', title: 'Clean Code' }, 'Clean Code'],
    [{ username: 'new.librarian', memberCode: 'M-0001' }, 'M-0001'],
    [{ title: 5, name: 'Science' }, 'Science'],
    [{ status: 'returned' }, null],
  ])('labels the result %o as %s', async (result, label) => {
    await run(
      contextFor(LoansController, 'create', { method: 'POST', user: admin }),
      result,
    );
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ label }));
  });

  it('uses the socket address when Express has no ip, and null when there is neither', async () => {
    await run(
      contextFor(LoansController, 'create', {
        method: 'POST',
        user: admin,
        remoteAddress: '::ffff:192.168.1.20',
      }),
    );
    await run(
      contextFor(LoansController, 'create', { method: 'POST', user: admin }),
    );
    expect(record.mock.calls.map(([entry]) => entry.ipAddress)).toEqual([
      '192.168.1.20',
      null,
    ]);
  });

  it('writes nothing when the handler fails', async () => {
    const context = contextFor(LoansController, 'create', {
      method: 'POST',
      user: admin,
    });
    const failing: CallHandler = {
      handle: () => throwError(() => new Error('copy is not available')),
    };
    await expect(
      lastValueFrom(interceptor.intercept(context, failing)),
    ).rejects.toThrow('copy is not available');
    expect(record).not.toHaveBeenCalled();
  });

  it('waits for the row to be written before the response goes out', async () => {
    let written = false;
    record.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      written = true;
      return '1';
    });
    await run(
      contextFor(LoansController, 'create', { method: 'POST', user: admin }),
    );
    expect(written).toBe(true);
  });
});
