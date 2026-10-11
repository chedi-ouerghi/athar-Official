import { Inject, Injectable } from '@nestjs/common';
import type { DesignDetail, DesignSummary, ListDesignsResponse } from '@athar/contracts';
import { DomainException } from '../common/http/domain.exception.js';
import type { Trajectory } from '../device/trajectory.js';
import type { DesignCollection, DesignRecord } from './design-collection.js';

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
    return { ...toSummary(this.find(designId)), previewPath: this.find(designId).previewPath };
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
