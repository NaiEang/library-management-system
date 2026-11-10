// BullMQ queue that carries one job per overdue loan item. The daily scan
// produces the jobs; OverdueNotificationProcessor consumes them.
export const OVERDUE_QUEUE = 'overdue-notifications';
export const OVERDUE_JOB = 'notify-overdue';

export interface OverdueJobData {
  loanItemId: string;
  // Set by the worker once the in-app notification is saved, so a retry
  // (e.g. the email failed) re-sends without saving a second row
  notificationId?: string;
}

// Daily at 08:00 library time unless OVERDUE_SCAN_CRON says otherwise;
// "off" disables the schedule (POST /notifications/overdue/scan still works)
export const DEFAULT_OVERDUE_SCAN_CRON = '0 8 * * *';

export const overdueMessage = (bookTitle: string) =>
  `Your book "${bookTitle}" is overdue. You are blocked until you return it.`;
