import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActivityLogQueryDto } from './activity-log-query.dto';

// The same two steps the global ValidationPipe ({ whitelist, transform }) runs on ?query
async function parse(query: Record<string, string>) {
  const dto = plainToInstance(ActivityLogQueryDto, query);
  const errors = await validate(dto, { whitelist: true });
  return { dto, invalid: errors.map((error) => error.property) };
}

describe('ActivityLogQueryDto', () => {
  it('defaults to the first page of 20', async () => {
    const { dto, invalid } = await parse({});
    expect(invalid).toEqual([]);
    expect(dto).toMatchObject({ page: 1, limit: 20 });
  });

  it('turns page and limit from query strings into numbers', async () => {
    const { dto, invalid } = await parse({ page: '3', limit: '50' });
    expect(invalid).toEqual([]);
    expect(dto).toMatchObject({ page: 3, limit: 50 });
  });

  it('accepts every filter in its proper form', async () => {
    const { invalid } = await parse({
      action: 'APPROVE',
      entityType: 'Loan',
      userId: '2',
      role: 'librarian',
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-10',
      search: 'clean code',
    });
    expect(invalid).toEqual([]);
  });

  it.each([
    [{ page: '0' }, 'page'],
    [{ page: '1.5' }, 'page'],
    [{ limit: '101' }, 'limit'],
    [{ limit: 'all' }, 'limit'],
    [{ userId: 'abc' }, 'userId'],
    [{ role: 'superuser' }, 'role'],
    [{ from: 'yesterday' }, 'from'],
    [{ to: 'not-a-date' }, 'to'],
  ])('rejects %o', async (query, property) => {
    const { invalid } = await parse(query);
    expect(invalid).toEqual([property]);
  });
});
