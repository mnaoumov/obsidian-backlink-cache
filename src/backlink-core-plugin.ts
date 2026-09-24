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

// Intentional `Record<>` use: the canvas-${string} key shape is open-ended (one entry per canvas node) and cannot be expressed by a closed object type or `Partial<T>`.
export interface CanvasDomResult extends Record<`canvas-${string}`, [from: number, to: number][]>, ResultDomResult {
}

export class BacklinksCorePluginComponent extends ComponentEx {
  public constructor(private readonly app: App) {
    super();
  }

  public override onload(): void {
    const backlinksCorePlugin = this.app.internalPlugins.getPluginById(InternalPluginName.Backlink);
    if (!backlinksCorePlugin) {
      return;
    }

    /*
     * Obsidian publishes this itself: `InternalPlugin.enable()` sets `enabled` as its first statement and
     * raises `change` on the manager as its last, and `disable()` mirrors that, so the flag read inside the
     * handler is always the post-transition one. Obsidian's own Core plugins settings tab listens to the
     * same signal. Diffing it replaces a monkey patch of `onUserEnable` on the `BacklinkPluginInstance`
     * prototype, which every vault shares.
     */
    let wasBacklinksCorePluginEnabled = backlinksCorePlugin.enabled;
    this.registerEvent(this.app.internalPlugins.on('change', () => {
      const isBacklinksCorePluginEnabled = backlinksCorePlugin.enabled;
      const hasBacklinksCorePluginJustBeenEnabled = isBacklinksCorePluginEnabled && !wasBacklinksCorePluginEnabled;
      wasBacklinksCorePluginEnabled = isBacklinksCorePluginEnabled;

      if (hasBacklinksCorePluginJustBeenEnabled) {
        this.onBacklinksCorePluginEnable();
      }
    }));

    if (backlinksCorePlugin.enabled) {
      this.onBacklinksCorePluginEnable();
    }
  }

  private onBacklinksCorePluginEnable(): void {
    invokeAsyncSafely(() => this.patchBacklinksPane());
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
