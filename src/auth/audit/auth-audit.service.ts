import { Injectable, Logger } from '@nestjs/common';

// Only the security events Chea's ActivityLogInterceptor can't see. Normal
// admin and librarian actions are logged by his interceptor, not here.
export type AuthAuditEvent =
  'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'REFRESH_TOKEN_REUSE' | 'THROTTLE_HIT';

// No field for passwords, tokens or hashes: they must never be logged.
export interface AuthAuditDetails {
  userId?: string | null;
  email?: string;
  ip?: string;
  reason?: string;
  route?: string;
  tracker?: string;
}

// Thin wrapper: writes to the Nest Logger for now. Later it will forward to
// Chea's ActivityLogService.log() once he exposes it.
@Injectable()
export class AuthAuditService {
  private readonly logger = new Logger('AuthAudit');

  record(event: AuthAuditEvent, details: AuthAuditDetails = {}): void {
    // JSON keeps user-supplied values (like an email) on one line, so they
    // can't forge extra log entries.
    const line = JSON.stringify({ event, ...details });
    if (event === 'LOGIN_SUCCESS') {
      this.logger.log(line);
    } else {
      this.logger.warn(line);
    }
  }
}
