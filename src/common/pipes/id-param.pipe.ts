import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

// Route ids are bigint, kept as strings. Anything but digits is a 400 before
// it reaches a query.
@Injectable()
export class IdParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^\d{1,18}$/.test(value)) {
      throw new BadRequestException('id must be a positive whole number');
    }
    return value;
  }
}
