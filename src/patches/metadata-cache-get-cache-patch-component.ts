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
        if (isCanvasFile(this.metadataCache.app, path)) {
          return this.canvasComponent.getCache(path);
        }

        return fallback();
      }
    });
  }
}
