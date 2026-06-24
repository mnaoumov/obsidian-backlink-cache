import type {
  BacklinkView,
  ResultDomResult
} from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import {
  InternalPluginName,
  ViewType
} from '@obsidian-typings/obsidian-public-latest/implementations';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';

import { BacklinkComponentRecomputeBacklinkPatchComponent } from './patches/backlink-component-recompute-backlink-patch-component.ts';
import { BacklinkPluginInstanceOnUserEnablePatchComponent } from './patches/backlink-plugin-instance-on-user-enable-patch-component.ts';

// Intentional `Record<>` use: the canvas-${string} key shape is open-ended (one entry per canvas node) and cannot be expressed by a closed object type or `Partial<T>`.
export interface CanvasDomResult extends Record<`canvas-${string}`, [from: number, to: number][]>, ResultDomResult {
}

export class BacklinksCorePluginComponent extends ComponentEx {
  public constructor(private readonly app: App) {
    super();
  }

  public onBacklinksCorePluginEnable(): void {
    invokeAsyncSafely(() => this.patchBacklinksPane());
  }

  public override onload(): void {
    const backlinksCorePlugin = this.app.internalPlugins.getPluginById(InternalPluginName.Backlink);
    if (!backlinksCorePlugin) {
      return;
    }

    this.addChild(
      new BacklinkPluginInstanceOnUserEnablePatchComponent({
        backlinkPluginInstance: backlinksCorePlugin.instance,
        backlinksCorePluginComponent: this
      })
    );

    if (backlinksCorePlugin.enabled) {
      this.onBacklinksCorePluginEnable();
    }
  }

  private async patchBacklinksPane(): Promise<void> {
    const backlinkView = await getBacklinkView(this.app);
    if (!backlinkView) {
      return;
    }

    this.addChild(
      new BacklinkComponentRecomputeBacklinkPatchComponent({
        backlinkComponent: backlinkView.backlink
      })
    );
  }
}

export async function reloadBacklinksView(app: App): Promise<void> {
  const backlinkView = await getBacklinkView(app);
  if (!backlinkView) {
    return;
  }
  if (backlinkView.file) {
    backlinkView.backlink.recomputeBacklink(backlinkView.file);
  }
}

async function getBacklinkView(app: App): Promise<BacklinkView | null> {
  const backlinksLeaf = app.workspace.getLeavesOfType(ViewType.Backlink)[0];
  if (!backlinksLeaf) {
    return null;
  }

  await backlinksLeaf.loadIfDeferred();
  return backlinksLeaf.view as BacklinkView;
}
