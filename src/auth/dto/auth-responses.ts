import { RoleName } from '../../users/enums/role-name.enum';

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
