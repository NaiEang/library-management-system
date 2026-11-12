import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import type { Repository } from 'typeorm';
import type { LoanItem } from '../../loans/entities/loan-item.entity';
import { OverdueScanService } from './overdue-scan.service';
import type { OverdueJobData } from './overdue.constants';

function setup(
  env: Record<string, string> = {},
  upcoming: Array<{ id: string; dueDate: Date }> = [],
) {
  const execute = vi.fn(() => Promise.resolve({ affected: 1 }));
  const qb = {
    update: vi.fn(() => qb),
    set: vi.fn(() => qb),
    where: vi.fn(() => qb),
    andWhere: vi.fn(() => qb),
    execute,
  };
  // First call: overdue items; second: borrowed items due in the next 48 hours
  const find = vi
    .fn()
    .mockResolvedValueOnce([{ id: '2' }, { id: '5' }])
    .mockResolvedValueOnce(upcoming);
  const addBulk = vi.fn(() => Promise.resolve([]));
  const addCronJob = vi.fn();
  const service = new OverdueScanService(
    { createQueryBuilder: () => qb, find } as unknown as Repository<LoanItem>,
    { addBulk } as unknown as Queue<OverdueJobData>,
    { get: (key: string) => env[key] } as unknown as ConfigService,
    { addCronJob } as unknown as SchedulerRegistry,
  );
  return { service, qb, find, addBulk, addCronJob };
}

describe('OverdueScanService', () => {
  it('marks late borrowed items overdue and queues one job per overdue item', async () => {
    const { service, qb, addBulk } = setup();
    // 2026-11-10 23:30 UTC is already the 11th in Phnom Penh (UTC+7)
    const now = new Date('2026-11-10T23:30:00Z');

    await expect(service.scan(now)).resolves.toEqual({
      marked: 1,
      queued: 2,
      overdue: 2,
      dueToday: 0,
      dueTomorrow: 0,
    });

    expect(qb.set).toHaveBeenCalledWith({ status: 'overdue' });
    expect(qb.where).toHaveBeenCalledWith('status = :borrowed', { borrowed: 'borrowed' });
    expect(qb.andWhere).toHaveBeenCalledWith('due_date < :now', { now });

    const jobs = (addBulk.mock.calls[0] as unknown as [Array<{ data: unknown; opts: { jobId: string } }>])[0];
    expect(jobs.map((j) => j.data)).toEqual([{ loanItemId: '2' }, { loanItemId: '5' }]);
    // One reminder per item per library day
    expect(jobs.map((j) => j.opts.jobId)).toEqual([
      'overdue-2-2026-11-11',
      'overdue-5-2026-11-11',
    ]);
  });

  it('queues due-today and due-tomorrow reminders by library date', async () => {
    // 2026-11-11 08:00 in Phnom Penh (UTC+7)
    const now = new Date('2026-11-11T01:00:00Z');
    const { service, find, addBulk } = setup({}, [
      // 2026-11-11 17:00 Phnom Penh: today
      { id: '6', dueDate: new Date('2026-11-11T10:00:00Z') },
      // 2026-11-12 00:30 Phnom Penh: tomorrow, though still the 11th in UTC
      { id: '7', dueDate: new Date('2026-11-11T17:30:00Z') },
      // 2026-11-13 06:00 Phnom Penh: the day after tomorrow, no reminder yet
      { id: '8', dueDate: new Date('2026-11-12T23:00:00Z') },
    ]);

    await expect(service.scan(now)).resolves.toMatchObject({
      queued: 4,
      overdue: 2,
      dueToday: 1,
      dueTomorrow: 1,
    });
    expect(find.mock.calls[1][0]).toMatchObject({
      where: { status: 'borrowed' },
    });
    const jobs = (addBulk.mock.calls[0] as unknown as [Array<{ data: unknown; opts: { jobId: string } }>])[0];
    expect(jobs.slice(2).map((j) => j.data)).toEqual([
      { loanItemId: '6', kind: 'due-today' },
      { loanItemId: '7', kind: 'due-tomorrow' },
    ]);
    expect(jobs.slice(2).map((j) => j.opts.jobId)).toEqual([
      'due-today-6-2026-11-11',
      'due-tomorrow-7-2026-11-11',
    ]);
  });

  it('schedules the daily scan by default', () => {
    const { service, addCronJob } = setup();
    service.onModuleInit();
    expect(addCronJob).toHaveBeenCalledWith('overdue-scan', expect.anything());
    // Stop it so the test process can exit
    (addCronJob.mock.calls[0] as unknown as [string, { stop(): void }])[1].stop();
  });

  it('does not schedule anything when OVERDUE_SCAN_CRON is "off"', () => {
    const { service, addCronJob } = setup({ OVERDUE_SCAN_CRON: 'off' });
    service.onModuleInit();
    expect(addCronJob).not.toHaveBeenCalled();
  });
});
