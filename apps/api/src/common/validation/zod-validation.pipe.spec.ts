import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationFailedException } from './validation-failed.exception.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const createDeviceSchema = z.object({
  name: z.string().min(2, 'Name is too short'),
  serial: z.string().regex(/^ATH-\d{4}$/, 'Serial must look like ATH-0001'),
  port: z.coerce.number().int().positive().optional(),
});

describe('ZodValidationPipe', () => {
  it('returns the parsed value for valid input', () => {
    const pipe = new ZodValidationPipe(createDeviceSchema);

    const result = pipe.transform({ name: 'Table', serial: 'ATH-0001', port: '3' });

    expect(result).toStrictEqual({ name: 'Table', serial: 'ATH-0001', port: 3 });
  });

  it('throws ValidationFailedException for invalid input', () => {
    const pipe = new ZodValidationPipe(createDeviceSchema);

    expect(() => pipe.transform({ name: 'T', serial: 'nope' })).toThrow(ValidationFailedException);
  });

  it('reports one detail per failing field, prefixed with the request source', () => {
    const pipe = new ZodValidationPipe(createDeviceSchema, 'body');

    let caught: ValidationFailedException | undefined;
    try {
      pipe.transform({ name: 'T', serial: 'nope' });
    } catch (error) {
      caught = error as ValidationFailedException;
    }

    expect(caught?.getStatus()).toBe(400);
    expect(caught?.details).toStrictEqual([
      { path: 'body.name', message: 'Name is too short' },
      { path: 'body.serial', message: 'Serial must look like ATH-0001' },
    ]);
  });

  it('reports nested paths in dotted notation', () => {
    const schema = z.object({ device: z.object({ mode: z.enum(['eco', 'boost']) }) });
    const pipe = new ZodValidationPipe(schema, 'query');

    let caught: ValidationFailedException | undefined;
    try {
      pipe.transform({ device: { mode: 'unknown' } });
    } catch (error) {
      caught = error as ValidationFailedException;
    }

    expect(caught?.details).toStrictEqual([
      { path: 'query.device.mode', message: 'Invalid option: expected one of "eco"|"boost"' },
    ]);
  });

  it('strips keys that the schema does not declare', () => {
    const pipe = new ZodValidationPipe(z.object({ name: z.string() }));

    expect(pipe.transform({ name: 'Table', isAdmin: true })).toStrictEqual({ name: 'Table' });
  });
});
