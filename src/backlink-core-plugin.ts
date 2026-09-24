import type {
  BacklinkView,
  ResultDomResult
} from '@obsidian-typings/obsidian-public-latest';
import type { BacklinkComponent } from '@obsidian-typings/obsidian-public-latest/implementations';
import type { App } from 'obsidian';

import {
  InternalPluginName,
  ViewType
} from '@obsidian-typings/obsidian-public-latest/implementations';
import { MarkdownView } from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';

import { BacklinkComponentRecomputeBacklinkPatchComponent } from './patches/backlink-component-recompute-backlink-patch-component.ts';

// Intentional `Record<>` use: the canvas-${string} key shape is open-ended (one entry per canvas node) and cannot be expressed by a closed object type or `Partial<T>`.
export interface CanvasDomResult extends Record<`canvas-${string}`, [from: number, to: number][]>, ResultDomResult {
}

export class BacklinksCorePluginComponent extends ComponentEx {
  private isBacklinksPanePatched = false;

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

    /*
     * The load and the enable are not the only moments a backlinks component can first appear: with the core plugin
     * enabled but its pane closed, there is nothing to patch at load, and opening the pane later raises no `change`.
     * Measured in a real Obsidian 1.14.2, that left the plugin inert until a restart with the pane open. Opening a
     * pane or a note changes the layout, so retry there until the patch is in; the once-guard in
     * `patchBacklinksPane` makes every later event a no-op.
     */
    this.registerEvent(this.app.workspace.on('layout-change', () => {
      if (backlinksCorePlugin.enabled && !this.isBacklinksPanePatched) {
        invokeAsyncSafely(() => this.patchLateBacklinks());
      }
    }));

    if (backlinksCorePlugin.enabled) {
      this.onBacklinksCorePluginEnable();
    }
  }

  private onBacklinksCorePluginEnable(): void {
    invokeAsyncSafely(() => this.patchBacklinksPane());
  }

  private async patchBacklinksPane(): Promise<boolean> {
    const [backlinkComponent] = await getBacklinkComponents(this.app);

    /*
     * Install the patch once. It sits on the `BacklinkComponent` prototype, which outlives the pane: disabling
     * the core Backlinks plugin leaves it in place and re-enabling it reuses the same class, so patching on every
     * enable only stacks another wrapper that the outermost one never calls through to. The enable path still
     * matters for the one case it covers alone - the core plugin was disabled when this component loaded, so
     * there was no pane to reach. Checked after the `await`, so a load-time call and an enable racing it cannot
     * both install.
     */
    if (!backlinkComponent || this.isBacklinksPanePatched) {
      return false;
    }

    this.isBacklinksPanePatched = true;
    this.addChild(
      new BacklinkComponentRecomputeBacklinkPatchComponent({
        backlinkComponent
      })
    );
    return true;
  }

  private async patchLateBacklinks(): Promise<void> {
    if (!await this.patchBacklinksPane()) {
      return;
    }

    // The backlinks that just appeared were computed before the patch was in, without the canvas backlinks.
    for (const backlinkComponent of await getBacklinkComponents(this.app)) {
      backlinkComponent.recomputeBacklink(backlinkComponent.file);
    }
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

/*
 * Every backlinks component on screen: the pane's first, then each note's in-document backlinks. They are one class,
 * so any of them reaches the prototype the patch sits on.
 */
async function getBacklinkComponents(app: App): Promise<BacklinkComponent[]> {
  const backlinkComponents: BacklinkComponent[] = [];

  const backlinkView = await getBacklinkView(app);
  if (backlinkView) {
    backlinkComponents.push(backlinkView.backlink);
  }

  for (const leaf of app.workspace.getLeavesOfType(ViewType.Markdown)) {
    if (leaf.view instanceof MarkdownView && leaf.view.backlinks) {
      backlinkComponents.push(leaf.view.backlinks);
    }
  }

  return backlinkComponents;
}

async function getBacklinkView(app: App): Promise<BacklinkView | null> {
  const backlinksLeaf = app.workspace.getLeavesOfType(ViewType.Backlink)[0];
  if (!backlinksLeaf) {
    return null;
  }

  await backlinksLeaf.loadIfDeferred();
  return backlinksLeaf.view as BacklinkView;
}
