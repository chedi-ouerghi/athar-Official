import { Controller, Get, UseGuards } from '@nestjs/common';
import type { ListAmbiencesResponse } from '@athar/contracts';
import { SessionGuard } from '../auth/session.guard.js';
import { AMBIENCES_V1 } from './data/ambiences.v1.js';

/**
 * The LED ambiences, `/api/v1/ambiences`. The same for every account; whether a
 * table may use them is its plan's business (`PUT /tables/:tableId/ambience`).
 */
@Controller('ambiences')
@UseGuards(SessionGuard)
export class AmbiencesController {
  @Get()
  list(): ListAmbiencesResponse {
    return { ambiences: [...AMBIENCES_V1] };
  }
}
