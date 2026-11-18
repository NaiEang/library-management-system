import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom, of } from 'rxjs';
import { error } from 'console';

@Injectable()
export class SpacesService {
  private readonly logger = new Logger(SpacesService.name);

  constructor(private readonly httpService: HttpService) {}

  async getAvailableSpaces() {
    const externalUrl = process.env.SPACE_BOOKING_API_URL || 'http://localhost:4000/api/spaces';
    const apiKey = process.env.SPACE_BOOKING_API_KEY;

    try {
      const response = await firstValueFrom(
        this.httpService.get(externalUrl, {
          headers: { 'x-api-key': apiKey },
          timeout: 3000,
        }).pipe(
          catchError((error) => {
            this.logger.error(`Space Booking API failed: ${error.message}`);
            return of({ data: [{ id: 'fallback', name: 'Spaces System Offline - Please ask Librarian', isAvailable: false }] });
          }),
        ),
      );
      return response.data;
    } catch (error) {
      return [{ id: 'fallback', name: 'Spaces System Offline - Please ask Librarian', isAvailable: false }];
    }
  }
}