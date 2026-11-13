import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { CronJob } from 'cron';
import { Between, IsNull, LessThan, Repository } from 'typeorm';
import { LoanItemStatus } from '../../common/constants';
import { withSpan } from '../../common/observability/with-span';
import { LoanItem } from '../../loans/entities/loan-item.entity';
import { addDays, libraryToday } from '../../members/library-date';
import {
  DEFAULT_OVERDUE_SCAN_CRON,
  OVERDUE_JOB,
  OVERDUE_QUEUE,
  type OverdueJobData,
  type ReminderKind,
} from './overdue.constants';

export interface OverdueScanResult {
  // Items moved from borrowed to overdue by this run
  marked: number;
  // Reminders handed to the queue (the three counts below together)
  queued: number;
  overdue: number;
  dueToday: number;
  dueTomorrow: number;
}

const DAY_MS = 24 * 3600 * 1000;

@Injectable()
export class OverdueScanService implements OnModuleInit {
  private readonly logger = new Logger('OverdueScan');
  private readonly timeZone: string;

  constructor(
    @InjectRepository(LoanItem)
    private readonly loanItems: Repository<LoanItem>,
    @InjectQueue(OVERDUE_QUEUE)
    private readonly queue: Queue<OverdueJobData>,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {
    this.timeZone =
      this.config.get<string>('LIBRARY_TIME_ZONE') ?? 'Asia/Phnom_Penh';
  }

  // Registered here rather than with @Cron so the schedule can come from
  // .env, which is only loaded once the app module is built
  onModuleInit() {
    const expression =
      this.config.get<string>('OVERDUE_SCAN_CRON') ?? DEFAULT_OVERDUE_SCAN_CRON;
    if (expression === 'off') return;

    const job = CronJob.from({
      cronTime: expression,
      timeZone: this.timeZone,
      onTick: () => {
        this.scan().catch((error: Error) =>
          this.logger.error(
            `overdue scan failed: ${error.message}`,
            error.stack,
          ),
        );
      },
    });
    this.scheduler.addCronJob('overdue-scan', job);
    job.start();
  }

  async scan(now: Date = new Date()): Promise<OverdueScanResult> {
    return withSpan('overdue.scan', async () => {
      const marked = await this.loanItems
        .createQueryBuilder()
        .update(LoanItem)
        .set({ status: LoanItemStatus.OVERDUE })
        .where('status = :borrowed', { borrowed: LoanItemStatus.BORROWED })
        .andWhere('returned_at IS NULL')
        .andWhere('due_date < :now', { now })
        .execute();

      const overdue = await this.loanItems.find({
        select: { id: true },
        where: {
          status: LoanItemStatus.OVERDUE,
          returnedAt: IsNull(),
          dueDate: LessThan(now),
        },
        order: { id: 'ASC' },
      });

      // Still borrowed and due today or tomorrow (library calendar). Every
      // due date in those two days is less than 48 hours away.
      const today = libraryToday(this.timeZone, now);
      const tomorrow = addDays(today, 1);
      const upcoming = await this.loanItems.find({
        select: { id: true, dueDate: true },
        where: {
          status: LoanItemStatus.BORROWED,
          returnedAt: IsNull(),
          dueDate: Between(now, new Date(now.getTime() + 2 * DAY_MS)),
        },
        order: { id: 'ASC' },
      });
      const dueOn = (day: string) =>
        upcoming.filter(
          (item) => libraryToday(this.timeZone, item.dueDate!) === day,
        );
      const dueToday = dueOn(today);
      const dueTomorrow = dueOn(tomorrow);

      // One reminder of each kind per item per library day: the job id makes
      // a second scan on the same day (manual trigger, restart) a no-op
      const job = (kind: ReminderKind, item: { id: string }) => ({
        name: OVERDUE_JOB,
        data:
          kind === 'overdue'
            ? { loanItemId: item.id }
            : { loanItemId: item.id, kind },
        opts: {
          jobId: `${kind}-${item.id}-${today}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: { age: 7 * 24 * 3600 },
          removeOnFail: { age: 30 * 24 * 3600 },
        },
      });
      await this.queue.addBulk([
        ...overdue.map((item) => job('overdue', item)),
        ...dueToday.map((item) => job('due-today', item)),
        ...dueTomorrow.map((item) => job('due-tomorrow', item)),
      ]);

      const result = {
        marked: marked.affected ?? 0,
        queued: overdue.length + dueToday.length + dueTomorrow.length,
        overdue: overdue.length,
        dueToday: dueToday.length,
        dueTomorrow: dueTomorrow.length,
      };
      this.logger.log(
        `marked ${result.marked} item(s) overdue; queued ${result.overdue} overdue, ` +
          `${result.dueToday} due-today and ${result.dueTomorrow} due-tomorrow reminder(s)`,
      );
      return result;
    });
  }
}
