// Stored in notifications.type. Every writer (services, workers, the dev
// seed) uses these values, so the frontend can switch on one spelling.
export enum NotificationType {
  LOAN_APPROVED = 'LOAN_APPROVED',
  LOAN_REJECTED = 'LOAN_REJECTED',
  LOAN_DUE_SOON = 'LOAN_DUE_SOON',
  LOAN_DUE_TODAY = 'LOAN_DUE_TODAY',
  LOAN_OVERDUE = 'LOAN_OVERDUE',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
}
