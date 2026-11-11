export const COPY_CODE_PREFIX = 'LIB-';
export const COPY_CONDITIONS: string[] = ['new', 'good', 'fair', 'poor', 'damaged'];
// Statuses a librarian may set by hand.
// Borrowing and returning are handled by the loans module, not here.
export const MANUAL_COPY_STATUSES: string[] = ['available', 'lost', 'damaged'];