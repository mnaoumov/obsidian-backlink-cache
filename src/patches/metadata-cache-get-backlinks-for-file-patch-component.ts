import type { MetadataCache } from 'obsidian';
import type { GetBacklinksForFileSafeWrapper } from 'obsidian-dev-utils/obsidian/metadata-cache';

import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import type { BacklinkCacheComponent } from '../backlink-cache-component.ts';

type GetBacklinksForFileFn = MetadataCache['getBacklinksForFile'];

interface MetadataCacheGetBacklinksForFilePatchComponentConstructorParams {
  readonly backlinkCacheComponent: BacklinkCacheComponent;
  readonly metadataCache: MetadataCache;
}

export class MetadataCacheGetBacklinksForFilePatchComponent extends MonkeyAroundComponent {
  private readonly backlinkCacheComponent: BacklinkCacheComponent;
  private readonly metadataCache: MetadataCache;

  public constructor(params: MetadataCacheGetBacklinksForFilePatchComponentConstructorParams) {
    super();
    this.metadataCache = params.metadataCache;
    this.backlinkCacheComponent = params.backlinkCacheComponent;
  }

  public override onload(): void {
    this.registerPatch(this.metadataCache, {
      getBacklinksForFile: (originalFn: GetBacklinksForFileFn): GetBacklinksForFileFn & GetBacklinksForFileSafeWrapper => {
        const patched: GetBacklinksForFileFn & GetBacklinksForFileSafeWrapper = Object.assign(this.backlinkCacheComponent.getBacklinksForFile.bind(this.backlinkCacheComponent), {
          originalFn: originalFn.bind(this.metadataCache),
          safe: this.backlinkCacheComponent.getBacklinksForFileSafe.bind(this.backlinkCacheComponent)
        });
        return patched;
      }
    });
  }
}
