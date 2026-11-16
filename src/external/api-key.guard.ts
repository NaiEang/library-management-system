import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly key: string | null;

  constructor(config: ConfigService) {
    this.key = config.get<string>('SHARED_SERVICE_API_KEY') ?? null;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.key) {
      throw new UnauthorizedException('API key authentication is not configured');
    }
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-api-key'];
    if (typeof provided !== 'string' || !this.safeEqual(provided, this.key)) {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}
