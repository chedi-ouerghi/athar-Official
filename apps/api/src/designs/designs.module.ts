import { Module, type DynamicModule } from '@nestjs/common';
import { designCollectionV1 } from './data/designs.v1.js';
import {
  loadDesignCollection,
  type DesignCollection,
  type DesignCollectionDefinition,
} from './design-collection.js';
import { DESIGN_COLLECTION, DesignsService } from './designs.service.js';
import { DesignsController } from './designs.controller.js';
import { AmbiencesController } from './ambiences.controller.js';

/**
 * The design library.
 *
 * The collection is validated, and the previews derived, when the module is
 * *described*, not lazily, so a design that breaks the rules throws while
 * `AppModule.forRoot` runs, before the application exists and long before it
 * listens. The process never serves a collection it did not accept.
 */
@Module({})
export class DesignsModule {
  static forRoot(definition: DesignCollectionDefinition = designCollectionV1): DynamicModule {
    const collection: DesignCollection = loadDesignCollection(definition);

    return {
      module: DesignsModule,
      global: true,
      controllers: [DesignsController, AmbiencesController],
      providers: [{ provide: DESIGN_COLLECTION, useValue: collection }, DesignsService],
      exports: [DesignsService],
    };
  }
}
