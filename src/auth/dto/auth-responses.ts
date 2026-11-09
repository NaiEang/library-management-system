import { MembershipStatus, RoleName } from '../../common/constants';

// The tokens a client receives on login and on every refresh.
export interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  // Access token lifetime in seconds.
  expiresIn: number;
  // Use it once with POST /auth/refresh: it's replaced by a new one each time.
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface LoginResponse extends TokenResponse {
  user: {
    id: string;
    email: string;
    username: string;
    role: RoleName;
    // null for staff, who have no member row.
    membershipStatus: string | null;
  };
}

export interface RegisterResponse {
  id: string;
  email: string;
  username: string;
  role: RoleName.MEMBER;
  membershipStatus: MembershipStatus.PENDING_DEPOSIT;
}
