import { SetMetadata } from '@nestjs/common';

export const GOLD_MEMBER_KEY = 'goldMember';

// Restricts a route (or a whole controller) to GOLD members: logged-in members
// whose gold period hasn't ended, with an active account and membership. It is
// checked against the database on every request (MembershipService.isGold),
// never from the token. Everyone else gets 403 "Gold membership required",
// staff included: staff routes keep using @Roles().
//
//   @GoldMember()
//   @Post('rooms/:id/book')
//   bookRoom(@CurrentUser('memberId') memberId: string) { ... }
//
// Nothing to import into your module: the guard is registered globally.
export const GoldMember = () => SetMetadata(GOLD_MEMBER_KEY, true);
