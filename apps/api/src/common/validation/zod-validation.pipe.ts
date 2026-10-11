/**
 * Request-boundary validation backed by Zod.
 *
 * Apply it to any inbound payload that crosses the HTTP boundary:
 *
 * ```ts
 * @Post()
 * create(@Body(new ZodValidationPipe(createThingSchema)) body: CreateThing) {}
 * ```
 *
 * Valid input is passed through with the *parsed* value, so handlers receive
 * output that has already been coerced and stripped of unknown keys.
 */

import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ValidationFailedException } from './validation-failed.exception.js';
import { toErrorDetails } from './zod-issues.js';

/** Location label used to prefix reported error paths. */
export type ValidationSource = 'body' | 'query' | 'params';

export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  z.input<TSchema>,
  z.output<TSchema>
> {
  constructor(
    private readonly schema: TSchema,
    private readonly source: ValidationSource = 'body',
  ) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new ValidationFailedException(toErrorDetails(this.source, result.error.issues));
    }

    return result.data;
  }
}
