import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { type LoggerService, type LogLevel } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

export interface LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  context: string;
  message: string;
  traceId?: string;
  spanId?: string;
  meta?: Record<string, unknown>;
}

const MAX_ENTRIES = 2000;
const COLORS: Record<LogLevel, string> = {
  fatal: '\x1b[35m',
  error: '\x1b[31m',
  warn: '\x1b[33m',
  log: '\x1b[32m',
  debug: '\x1b[36m',
  verbose: '\x1b[90m',
};

/**
 * Nest logger that stamps every line with the active trace/span id, so a log
 * line can be opened as a trace and a trace shows its logs. Writes JSON lines to
 * LOG_FILE (ready for Loki/Promtail later) and keeps a ring buffer for the UI.
 */
export class AppLogger implements LoggerService {
  private readonly entries: LogEntry[] = [];
  private nextId = 1;
  private readonly logFile = process.env.LOG_FILE;
  // Tests turn the console copy off; the ring buffer and file still get every line
  private readonly toStdout = process.env.LOG_STDOUT !== 'false';

  constructor() {
    if (this.logFile) mkdirSync(dirname(this.logFile), { recursive: true });
    // A closed stdout (terminal gone, pipe reader exited) must not take the API down; the file still gets every line
    process.stdout.on('error', () => undefined);
  }

  log(message: unknown, ...optional: unknown[]) {
    this.write('log', message, optional);
  }
  error(message: unknown, ...optional: unknown[]) {
    this.write('error', message, optional);
  }
  warn(message: unknown, ...optional: unknown[]) {
    this.write('warn', message, optional);
  }
  debug(message: unknown, ...optional: unknown[]) {
    this.write('debug', message, optional);
  }
  verbose(message: unknown, ...optional: unknown[]) {
    this.write('verbose', message, optional);
  }
  fatal(message: unknown, ...optional: unknown[]) {
    this.write('fatal', message, optional);
  }

  query(filter: {
    level?: string;
    traceId?: string;
    context?: string;
    search?: string;
    limit?: number;
  }): LogEntry[] {
    const levels = filter.level?.split(',');
    const search = filter.search?.toLowerCase();
    const result: LogEntry[] = [];
    for (
      let i = this.entries.length - 1;
      i >= 0 && result.length < (filter.limit ?? 200);
      i--
    ) {
      const entry = this.entries[i];
      if (levels && !levels.includes(entry.level)) continue;
      if (filter.traceId && entry.traceId !== filter.traceId) continue;
      if (filter.context && entry.context !== filter.context) continue;
      if (
        search &&
        !`${entry.context} ${entry.message}`.toLowerCase().includes(search)
      )
        continue;
      result.push(entry);
    }
    return result;
  }

  private write(level: LogLevel, message: unknown, optional: unknown[]) {
    // Nest passes the context as the last string argument; an Error stack may precede it
    const args = [...optional];
    const context =
      typeof args.at(-1) === 'string' ? (args.pop() as string) : 'App';
    const meta: Record<string, unknown> = {};
    for (const arg of args) {
      if (typeof arg === 'string') meta.stack = arg;
      else if (arg && typeof arg === 'object') Object.assign(meta, arg);
    }

    const span = trace.getActiveSpan();
    const spanContext = span?.spanContext();
    const entry: LogEntry = {
      id: this.nextId++,
      time: new Date().toISOString(),
      level,
      context,
      message:
        message instanceof Error
          ? message.message
          : typeof message === 'string'
            ? message
            : JSON.stringify(message),
      traceId: spanContext?.traceId,
      spanId: spanContext?.spanId,
      meta: Object.keys(meta).length ? meta : undefined,
    };

    if (span && (level === 'warn' || level === 'error' || level === 'fatal')) {
      span.addEvent(`log.${level}`, {
        'log.message': entry.message,
        'log.context': context,
      });
    }

    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();

    const traceTag = entry.traceId
      ? ` \x1b[90m[trace ${entry.traceId.slice(0, 8)}]\x1b[0m`
      : '';
    if (this.logFile)
      appendFileSync(this.logFile, `${JSON.stringify(entry)}\n`);
    if (this.toStdout && process.stdout.writable) {
      process.stdout.write(
        `${COLORS[level]}${level.toUpperCase().padEnd(7)}\x1b[0m ${entry.time} \x1b[33m[${context}]\x1b[0m ${entry.message}${traceTag}\n`,
      );
    }
  }
}

export const appLogger = new AppLogger();
