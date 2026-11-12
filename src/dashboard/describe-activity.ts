const VERBS: Record<string, string> = {
  CREATE: 'created',
  UPDATE: 'updated',
  DELETE: 'deleted',
  APPROVE: 'approved',
  REJECT: 'rejected',
  RETURN: 'checked in',
  VERIFY_DEPOSIT: 'verified the deposit of',
  SET_ACCOUNT_STATUS: 'changed the account status of',
  RESET_PASSWORD: 'reset the password of',
  GOLD_MEMBERSHIP: 'took the gold membership fee of',
};

export interface ActivityDescription {
  username: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  label?: string | null;
}

/** One readable line per activity row, e.g. `librarian2 approved Loan #812 "LN-000812"`. */
export function describeActivity({
  username,
  action,
  entityType,
  entityId,
  label,
}: ActivityDescription) {
  if (action === 'LOGIN') return `${username} logged in`;
  const verb = VERBS[action] ?? action.toLowerCase().replace(/_/g, ' ');
  return `${username} ${verb} ${entityType}${entityId ? ` #${entityId}` : ''}${label ? ` "${label}"` : ''}`;
}
