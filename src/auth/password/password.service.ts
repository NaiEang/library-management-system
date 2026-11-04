import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

// OWASP minimum for argon2id: 19 MiB memory, 2 iterations, 1 lane.
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  // A malformed or empty stored hash counts as a mismatch, never as a match.
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
