import { MembershipStatus, RoleName } from '../../common/constants';

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  // Access token lifetime in seconds.
  expiresIn: number;
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
