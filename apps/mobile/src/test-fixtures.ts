import type { DesignDetail, DrawingJob, Table } from '@athar/contracts';
import { ApiError } from './api/http-client';

export const TABLE_ID = 'k7q3x9m2d8r5t6w4';
export const JOB_ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const NOW = '2026-01-01T00:00:00.000Z';

export function table(overrides: Partial<Table> = {}): Table {
  return {
    id: TABLE_ID,
    displayName: 'Main hall',
    location: 'Ground floor',
    enabled: true,
    mode: 'simulation',
    connection: 'online',
    activeJobId: null,
    plan: 'basic',
    voiceAssistant: false,
    features: ['catalogue', 'rake'],
    ambienceId: null,
    readiness: { paired: true, online: true, free: true, canStart: true },
    ...overrides,
  };
}

export function design(id: string, overrides: Partial<DesignDetail> = {}): DesignDetail {
  return {
    id,
    slug: id,
    title: { en: `Design ${id}`, ar: `تصميم ${id}` },
    description: { en: `About ${id}.`, ar: `عن ${id}.` },
    inspiration: {
      kind: 'original-modern',
      note: { en: 'An original interpretation.', ar: 'تفسير أصلي.' },
      sources: [],
    },
    estimatedDurationSeconds: 180,
    previewPath: [
      [0, 0],
      [3, 1],
    ],
    ...overrides,
  };
}

export const FOUR_DESIGNS = ['dunes', 'khoos', 'sadu', 'star'].map((id) => design(id));

export function job(overrides: Partial<DrawingJob> = {}): DrawingJob {
  return {
    id: JOB_ID,
    tableId: TABLE_ID,
    kind: 'design',
    designId: 'dunes',
    mode: 'simulation',
    state: 'drawing',
    progress: 0.25,
    createdAt: NOW,
    startedAt: NOW,
    updatedAt: NOW,
    finishedAt: null,
    errorCode: null,
    ...overrides,
  };
}

/** An error the way the API reports it. */
export function apiError(code: ApiError['code'], status = 409): ApiError {
  return new ApiError('http', 'raw message', status, code);
}

export const networkError = (): ApiError => new ApiError('network', 'raw');
