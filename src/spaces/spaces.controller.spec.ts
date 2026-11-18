import { Test, TestingModule } from '@nestjs/testing';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('SpacesController', () => {
  let controller: SpacesController;
  let service: SpacesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpacesController],
      providers: [
        {
          provide: SpacesService,
          useValue: {
            getAvailableSpaces: vi.fn().mockResolvedValue([{ id: '1', name: 'Test Room' }] as any),
          },
        },
      ],
    }).compile();

    controller = module.get<SpacesController>(SpacesController);
    service = module.get<SpacesService>(SpacesService);
  });

  it('should route internal requests to the service', async () => {
    const result = await controller.getSpacesForFrontend(); // Or getSpaces() if you renamed it!
    expect(result).toEqual([{ id: '1', name: 'Test Room' }]);
    expect(service.getAvailableSpaces).toHaveBeenCalled();
  });

  it('should return student library status for the B2B route', () => {
    const studentId = '12345';
    const result = controller.checkLibraryStatus(studentId);
    
    expect(result.studentId).toEqual(studentId);
    expect(result.hasOverdueBooks).toEqual(false);
    expect(result.message).toContain('Approved');
  });
});