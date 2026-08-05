import type { CanvasPluginInstance } from '@obsidian-typings/obsidian-public-latest';

import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import type { CanvasComponent } from '../canvas.ts';

interface CanvasPluginInstanceOnUserDisablePatchComponentConstructorParams {
  readonly canvasComponent: CanvasComponent;
  readonly canvasPluginInstance: CanvasPluginInstance;
}

export class CanvasPluginInstanceOnUserDisablePatchComponent extends MonkeyAroundComponent {
  private readonly canvasComponent: CanvasComponent;
  private readonly canvasPluginInstance: CanvasPluginInstance;

  public constructor(params: CanvasPluginInstanceOnUserDisablePatchComponentConstructorParams) {
    super();
    this.canvasPluginInstance = params.canvasPluginInstance;
    this.canvasComponent = params.canvasComponent;
  }

  public override onload(): void {
    this.registerMethodPatch({
      $object: getPrototypeOf(this.canvasPluginInstance),
      methodName: 'onUserDisable',
      patchHandler: () => {
        this.canvasComponent.onCanvasCorePluginDisable();
      }
    });
  }
}
