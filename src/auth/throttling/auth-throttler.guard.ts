import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthAuditService } from '../audit/auth-audit.service';

// ThrottlerGuard that also records a THROTTLE_HIT security event.
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  // Property injection: ThrottlerGuard owns the constructor signature.
  @Inject(AuthAuditService)
  private readonly audit: AuthAuditService;

  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const req = context.switchToHttp().getRequest<Request>();
    this.audit.record('THROTTLE_HIT', {
      route: `${req.method} ${req.path}`,
      ip: req.ip,
      tracker: detail.tracker,
    });
    return super.throwThrottlingException(context, detail);
  }
}
