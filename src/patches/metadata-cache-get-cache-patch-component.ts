import type { MetadataCache } from 'obsidian';

import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import { isCanvasFile } from 'obsidian-dev-utils/obsidian/file-system';

import type { CanvasComponent } from '../canvas.ts';

interface MetadataCacheGetCachePatchComponentConstructorParams {
  readonly canvasComponent: CanvasComponent;
  readonly metadataCache: MetadataCache;
}

export class MetadataCacheGetCachePatchComponent extends MonkeyAroundComponent {
  private readonly canvasComponent: CanvasComponent;
  private readonly metadataCache: MetadataCache;

  public constructor(params: MetadataCacheGetCachePatchComponentConstructorParams) {
    super();
    this.metadataCache = params.metadataCache;
    this.canvasComponent = params.canvasComponent;
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'getCache',
      obj: this.metadataCache,
      patchHandler: ({
        fallback,
        originalArgs: [path]
      }) => {
        // Route canvas files by extension alone — O(1). `isCanvasFile` checks the `.canvas`
        // extension string without resolving the path to a `TFile`.
        // Resolving a miss (an already-removed path during a delete cascade) would trigger an
        // O(vault) scan, which this hot patch must never do.
        if (isCanvasFile(path)) {
          return this.canvasComponent.getCache(path);
        }

        return fallback();
      }
    });
  }
}
