import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const validApiKey = process.env.SHARED_SERVICE_API_KEY || 'your-default-api-key';
    console.log('Apidog sent:', apiKey);
    console.log('Server expects:', validApiKey);
    if (apiKey !== validApiKey) {
      throw new UnauthorizedException('Invalid API Key');
    }
    
    return true;
  }
}