import type { MetadataCache } from 'obsidian';

import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import { CANVAS_FILE_EXTENSION } from 'obsidian-dev-utils/obsidian/file-system';

import type { CanvasComponent } from '../canvas.ts';

const CANVAS_FILE_SUFFIX = `.${CANVAS_FILE_EXTENSION}`;

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
        if (isCanvasPath(path)) {
          return this.canvasComponent.getCache(path);
        }

        return fallback();
      }
    });
  }
}

/**
 * Decides whether a path is a canvas file by its extension alone, without resolving it
 * to a `TFile`. `getCache` is hit per file during Obsidian's delete cascade and by
 * synthetic callers (e.g. Advanced Exclude hiding a folder), often for paths that no
 * longer exist; resolving such a miss via `isCanvasFile` triggers a case-insensitive
 * `getAbstractFileByPath` scan that is O(vault) per call. This string check is O(1).
 */
function isCanvasPath(path: string): boolean {
  return path.toLowerCase().endsWith(CANVAS_FILE_SUFFIX);
}
