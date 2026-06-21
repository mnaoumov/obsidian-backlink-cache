import type { MetadataCache } from 'obsidian';

import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import type { BacklinkCacheComponent } from '../backlink-cache-component.ts';

interface MetadataCacheUpdateRelatedLinksPatchComponentConstructorParams {
  readonly backlinkCacheComponent: BacklinkCacheComponent;
  readonly metadataCache: MetadataCache;
}

export class MetadataCacheUpdateRelatedLinksPatchComponent extends MonkeyAroundComponent {
  private readonly backlinkCacheComponent: BacklinkCacheComponent;
  private readonly metadataCache: MetadataCache;

  public constructor(params: MetadataCacheUpdateRelatedLinksPatchComponentConstructorParams) {
    super();
    this.metadataCache = params.metadataCache;
    this.backlinkCacheComponent = params.backlinkCacheComponent;
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'updateRelatedLinks',
      obj: this.metadataCache,
      patchHandler: ({
        originalArgs: [fileNames]
      }) => {
        this.backlinkCacheComponent.updateRelatedLinks(fileNames);
      }
    });
  }
}
