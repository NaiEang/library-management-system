import { NotificationType } from '../enums/notification-type.enum';

// BullMQ queue that carries one job per loan-item reminder. The daily scan
// produces the jobs; OverdueNotificationProcessor consumes them.
export const OVERDUE_QUEUE = 'overdue-notifications';
export const OVERDUE_JOB = 'notify-overdue';

// due-tomorrow and due-today: still borrowed; overdue: past the due date.
export type ReminderKind = 'overdue' | 'due-today' | 'due-tomorrow';

export interface OverdueJobData {
  loanItemId: string;
  // Missing on jobs queued before due-date reminders existed: overdue
  kind?: ReminderKind;
  // Set by the worker once the in-app notification is saved, so a retry
  // (e.g. the email failed) re-sends without saving a second row
  notificationId?: string;
  // Channels that already delivered, so a retry (e.g. Telegram failed)
  // doesn't send the email twice
  delivered?: string[];
}

// Daily at 08:00 library time unless OVERDUE_SCAN_CRON says otherwise;
// "off" disables the schedule (POST /notifications/overdue/scan still works)
export const DEFAULT_OVERDUE_SCAN_CRON = '0 8 * * *';

// What a reminder message can mention about the book.
export interface ReminderDetails {
  bookTitle: string;
  // The due date in the library's calendar, e.g. "Fri, 13 Nov 2026"
  dueDate: string;
  // Whole library days past the due date (0 unless overdue)
  daysOverdue: number;
}

export interface Reminder {
  type: NotificationType;
  // Shown on Telegram before the title
  icon: string;
  title: string;
  // Plain text: saved in-app and sent by email and Telegram
  message: (details: ReminderDetails) => string;
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

export const REMINDERS: Record<ReminderKind, Reminder> = {
  'due-tomorrow': {
    type: NotificationType.LOAN_DUE_SOON,
    icon: '📚',
    title: 'Your book is due tomorrow',
    message: ({ bookTitle, dueDate }) =>
      `Friendly reminder: "${bookTitle}" is due back tomorrow, ${dueDate}.\n\n` +
      `Please return it to the library on time. Late returns pause your ` +
      `borrowing and late fees may apply.`,
  },
  'due-today': {
    type: NotificationType.LOAN_DUE_TODAY,
    icon: '⏰',
    title: 'Your book is due today',
    message: ({ bookTitle, dueDate }) =>
      `"${bookTitle}" is due back today, ${dueDate}.\n\n` +
      `Please return it to the library today to keep your account in good standing.`,
  },
  overdue: {
    type: NotificationType.LOAN_OVERDUE,
    icon: '⚠️',
    title: 'Your book is overdue',
    message: ({ bookTitle, dueDate, daysOverdue }) =>
      `"${bookTitle}" was due on ${dueDate}` +
      (daysOverdue > 0
        ? ` and is now ${days(daysOverdue)} overdue.`
        : ' and is now overdue.') +
      `\n\nYou can't borrow other books until it is returned, and late fees may apply. ` +
      `Please return it to the library as soon as possible.`,
  },
};
