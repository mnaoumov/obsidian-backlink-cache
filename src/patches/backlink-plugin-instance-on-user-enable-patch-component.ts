import type { BacklinkPluginInstance } from '@obsidian-typings/obsidian-public-latest';

import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import type { BacklinksCorePluginComponent } from '../backlink-core-plugin.ts';

interface BacklinkPluginInstanceOnUserEnablePatchComponentConstructorParams {
  readonly backlinkPluginInstance: BacklinkPluginInstance;
  readonly backlinksCorePluginComponent: BacklinksCorePluginComponent;
}

export class BacklinkPluginInstanceOnUserEnablePatchComponent extends MonkeyAroundComponent {
  private readonly backlinkPluginInstance: BacklinkPluginInstance;
  private readonly backlinksCorePluginComponent: BacklinksCorePluginComponent;

  public constructor(params: BacklinkPluginInstanceOnUserEnablePatchComponentConstructorParams) {
    super();
    this.backlinkPluginInstance = params.backlinkPluginInstance;
    this.backlinksCorePluginComponent = params.backlinksCorePluginComponent;
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'onUserEnable',
      obj: getPrototypeOf(this.backlinkPluginInstance),
      patchHandler: ({
        fallback
      }) => {
        fallback();
        this.backlinksCorePluginComponent.onBacklinksCorePluginEnable();
      }
    });
  }
}
