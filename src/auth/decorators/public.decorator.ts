import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Skips the global JwtAuthGuard. Use only for routes that guests must reach.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
