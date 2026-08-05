import type { MetadataCache } from 'obsidian';
import type { GetBacklinksForFileSafeWrapper } from 'obsidian-dev-utils/obsidian/metadata-cache';

import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import type { BacklinkCacheComponent } from '../backlink-cache-component.ts';

type GetBacklinksForFileFunction = MetadataCache['getBacklinksForFile'];

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
    this.registerMethodPatch({
      $object: this.metadataCache,
      methodName: 'getBacklinksForFile',
      patchHandler: ({
        originalArguments: [file]
      }) => {
        return this.backlinkCacheComponent.getBacklinksForFile(file);
      },
      postPatchHandler: ({
        originalMethod,
        patchedMethod
      }): GetBacklinksForFileFunction & GetBacklinksForFileSafeWrapper => {
        return Object.assign(patchedMethod, {
          // eslint-disable-next-line unicorn/name-replacements -- `originalFn` is this plugin's documented public API - the README tells users to call it.
          originalFn: originalMethod.bind(this.metadataCache),
          safe: this.backlinkCacheComponent.getBacklinksForFileSafe.bind(this.backlinkCacheComponent)
        });
      }
    });
  }
}
