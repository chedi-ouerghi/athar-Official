import { Inject, Injectable } from '@nestjs/common';
import type { DesignDetail, DesignSummary, ListDesignsResponse } from '@athar/contracts';
import { DomainException } from '../common/http/domain.exception.js';
import type { PolarPoint, Trajectory } from '../device/trajectory.js';
import { estimateDurationSeconds } from './data/designs.v1.js';
import {
  DesignCollectionError,
  trajectoryProblems,
  type DesignCollection,
  type DesignRecord,
} from './design-collection.js';
import { FREEHAND_MAX_LENGTH, freehandTrajectory } from './freehand.js';
import { generateRake } from './generators/rake.js';
import { polarToXY, polylineLength } from './geometry.js';

/** What the drawing engine needs to draw something: a design, the rake or a freehand path. */
export interface DrawingPlan {
  readonly trajectory: Trajectory;
  /** From the same nominal speed as every design. */
  readonly estimatedDurationSeconds: number;
}

/** Checked when this file loads, so a broken rake stops the process before it starts. */
const RAKE: DrawingPlan = (() => {
  const trajectory = generateRake();
  const problems = trajectoryProblems(trajectory);

  if (problems.length > 0) {
    throw new DesignCollectionError(problems.map((problem) => `the rake: ${problem}`));
  }

  return { trajectory, estimatedDurationSeconds: estimateDurationSeconds(trajectory) };
})();

/** Dependency-injection token for the validated {@link DesignCollection}. */
export const DESIGN_COLLECTION = Symbol('DESIGN_COLLECTION');

/**
 * The public view of the design collection.
 *
 * Designs are static, validated at startup, and never change while the process
 * runs, so everything is held in memory. What leaves this service is built field
 * by field: a design's trajectory is API-internal and has no way to reach a
 * response by accident.
 */
@Injectable()
export class DesignsService {
  constructor(@Inject(DESIGN_COLLECTION) private readonly collection: DesignCollection) {}

  /** Every design, without previews, in collection order. */
  list(): ListDesignsResponse {
    return {
      collectionVersion: this.collection.collectionVersion,
      designs: this.collection.designs.map(toSummary),
    };
  }

  /**
   * One design, with the preview path.
   *
   * @throws DomainException `DESIGN_NOT_FOUND`
   */
  get(designId: string): DesignDetail {
    const design = this.find(designId);

    return { ...toSummary(design), previewPath: design.previewPath };
  }

  /**
   * The full trajectory, for the drawing engine only. It has no route: nothing
   * here is ever sent to a client.
   *
   * @throws DomainException `DESIGN_NOT_FOUND`
   */
  getTrajectory(designId: string): Trajectory {
    return this.find(designId).trajectory;
  }

  /** The rake trajectory. */
  rake(): DrawingPlan {
    return RAKE;
  }

  /**
   * A freehand path, joined up and checked like a design (see `freehand.ts`).
   *
   * @throws DomainException `VALIDATION_FAILED` when it is too long or cannot be drawn
   */
  freehand(path: readonly PolarPoint[]): DrawingPlan {
    // Measured before joining it up, so an absurd path costs nothing: the lead-in
    // and the return add at most one radius each.
    const length = polylineLength(path.map(polarToXY)) + 2;

    if (length > FREEHAND_MAX_LENGTH) {
      throw new DomainException(
        'VALIDATION_FAILED',
        `The path is too long to draw: the limit is ${FREEHAND_MAX_LENGTH} table radii.`,
      );
    }

    const trajectory = freehandTrajectory(path);
    const problems = trajectoryProblems(trajectory);

    if (problems.length > 0) {
      throw new DomainException('VALIDATION_FAILED', `The path cannot be drawn: ${problems[0]}.`);
    }

    return { trajectory, estimatedDurationSeconds: estimateDurationSeconds(trajectory) };
  }

  private find(designId: string): DesignRecord {
    const design = this.collection.designs.find((candidate) => candidate.id === designId);

    if (design === undefined) {
      throw new DomainException('DESIGN_NOT_FOUND', `No design with id ${designId}.`);
    }

    return design;
  }
}

function toSummary(design: DesignRecord): DesignSummary {
  return {
    id: design.id,
    slug: design.slug,
    title: design.title,
    description: design.description,
    inspiration: design.inspiration,
    estimatedDurationSeconds: design.estimatedDurationSeconds,
  };
}
