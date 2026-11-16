import { ApiProperty } from '@nestjs/swagger';

export class EligibilityResponseDto {
  @ApiProperty({ example: 'student@example.com' })
  email: string;

  @ApiProperty({ example: true, description: 'Whether the email belongs to a registered library member' })
  isRegistered: boolean;

  @ApiProperty({ example: true, description: 'Whether the member is eligible to book a space' })
  canBookSpace: boolean;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Reason when canBookSpace is false: "Not a library member", "Account blocked due to overdue books", or "Membership not active"',
  })
  reason: string | null;
}
