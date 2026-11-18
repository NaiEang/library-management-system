import { Test, TestingModule } from '@nestjs/testing';
import { SpacesService } from './spaces.service';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('SpacesService', () => {
  let service: SpacesService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpacesService,
        {
          provide: HttpService,
          useValue: {
            get: vi.fn(), // Using Vitest's vi.fn()
          },
        },
      ],
    }).compile();

    service = module.get<SpacesService>(SpacesService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return external API data on success', async () => {
    const mockResponse = { data: [{ id: '1', name: 'Study Room A', isAvailable: true }] };
    
    // Using vi.spyOn for Vitest
    vi.spyOn(httpService, 'get').mockReturnValue(of(mockResponse as any));

    const result = await service.getAvailableSpaces();
    expect(result).toEqual(mockResponse.data);
    expect(httpService.get).toHaveBeenCalled();
  });

  it('should return graceful fallback data if external API crashes', async () => {
    vi.spyOn(httpService, 'get').mockReturnValue(throwError(() => new Error('Connection refused')));

    const result = await service.getAvailableSpaces();
    
    expect(result[0].id).toEqual('fallback');
    expect(result[0].isAvailable).toEqual(false);
  });
});