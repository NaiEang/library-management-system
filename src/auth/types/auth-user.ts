import { RoleName } from '../../users/enums/role-name.enum';

// What @CurrentUser() returns. Keep it small and stable: teammates depend on it.
// Membership status is deliberately absent; read it from the database.
export interface AuthUser {
  id: string;
  role: RoleName;
  memberId?: string;
}

// Access token claims. Anyone can read them, so nothing sensitive goes here.
export interface JwtPayload {
  sub: string;
  role: RoleName;
  iat?: number;
  exp?: number;
}
