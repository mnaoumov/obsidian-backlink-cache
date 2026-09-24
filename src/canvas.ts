import type {
  App,
  CachedMetadata,
  TAbstractFile
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { InternalPluginName } from '@obsidian-typings/obsidian-public-latest/implementations';
import { TFile } from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { getCanvasReferences } from 'obsidian-dev-utils/obsidian/canvas';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';
import { isCanvasFile } from 'obsidian-dev-utils/obsidian/file-system';
import { loop } from 'obsidian-dev-utils/obsidian/loop';

import type { BacklinkCacheComponent } from './backlink-cache-component.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { reloadBacklinksView } from './backlink-core-plugin.ts';
import { MetadataCacheGetCachePatchComponent } from './patches/metadata-cache-get-cache-patch-component.ts';

export function isCanvasPluginEnabled(app: App): boolean {
  return !!app.internalPlugins.getEnabledPluginById(InternalPluginName.Canvas);
}

const canvasMetadataCacheMap = new Map<string, CachedMetadata>();

interface CanvasComponentConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly app: App;
  readonly backlinkCacheComponent: BacklinkCacheComponent;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class CanvasComponent extends ComponentEx {
  private readonly abortSignalComponent: AbortSignalComponent;
  private readonly app: App;
  private readonly backlinkCacheComponent: BacklinkCacheComponent;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: CanvasComponentConstructorParams) {
    super();

    this.app = params.app;
    this.abortSignalComponent = params.abortSignalComponent;
    this.backlinkCacheComponent = params.backlinkCacheComponent;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public getCache(path: string): CachedMetadata | null {
    return canvasMetadataCacheMap.get(path) ?? null;
  }

  public override onload(): void {
    this.addChild(
      new MetadataCacheGetCachePatchComponent({
        canvasComponent: this,
        metadataCache: this.app.metadataCache
      })
    );

    this.registerEvent(this.app.vault.on('create', this.handleFileCreateOrModify.bind(this)));
    this.registerEvent(this.app.vault.on('modify', this.handleFileCreateOrModify.bind(this)));
    this.registerEvent(this.app.vault.on('delete', this.handleFileDelete.bind(this)));
    this.registerEvent(this.app.vault.on('rename', this.handleFileRename.bind(this)));

    const canvasCorePlugin = this.app.internalPlugins.getPluginById(InternalPluginName.Canvas);
    if (!canvasCorePlugin) {
      return;
    }

    /*
     * Obsidian publishes this itself: `InternalPlugin.enable()` sets `enabled` as its first statement and
     * raises `change` on the manager as its last, and `disable()` mirrors that, so the flag read inside the
     * handler is always the post-transition one. Obsidian's own Core plugins settings tab listens to the same
     * signal. Diffing it replaces a monkey patch of both `onUserEnable` and `onUserDisable` on the
     * `CanvasPluginInstance` prototype, which every vault shares - and it also catches a toggle that was not
     * driven by the user, which neither `onUser*` hook ever fired for.
     */
    let wasCanvasCorePluginEnabled = canvasCorePlugin.enabled;
    this.registerEvent(this.app.internalPlugins.on('change', () => {
      const isCanvasCorePluginEnabled = canvasCorePlugin.enabled;
      if (isCanvasCorePluginEnabled === wasCanvasCorePluginEnabled) {
        return;
      }
      wasCanvasCorePluginEnabled = isCanvasCorePluginEnabled;

      if (isCanvasCorePluginEnabled) {
        this.onCanvasCorePluginEnable();
      } else {
        this.onCanvasCorePluginDisable();
      }
    }));

    if (canvasCorePlugin.enabled) {
      this.onCanvasCorePluginEnable();
    }

    this.register(() => {
      this.onCanvasCorePluginDisable();
    });
  }

  private handleFileCreateOrModify(file: TAbstractFile): void {
    if (!isCanvasFile(file) || !(file instanceof TFile)) {
      return;
    }
    invokeAsyncSafely(async () => {
      await this.initCanvasMetadataCache(file);
      this.backlinkCacheComponent.triggerRefresh(file.path);
    });
  }

  private handleFileDelete(file: TAbstractFile): void {
    if (!isCanvasFile(file)) {
      return;
    }
    canvasMetadataCacheMap.delete(file.path);
  }

  private handleFileRename(file: TAbstractFile, oldPath: string): void {
    if (!isCanvasFile(file)) {
      return;
    }
    const canvasMetadataCache = canvasMetadataCacheMap.get(oldPath);
    if (canvasMetadataCache) {
      canvasMetadataCacheMap.set(file.path, canvasMetadataCache);
    }
    canvasMetadataCacheMap.delete(oldPath);
  }

  private async initCanvasMetadataCache(file: TFile): Promise<void> {
    if (!isCanvasFile(file)) {
      return;
    }

    const references = await getCanvasReferences(this.app, file);

    const cachedMetadata: CachedMetadata = {
      frontmatterLinks: []
    };

    // Store the canvas references in a synthetic per-file metadata cache so that
    // `metadataCache.getCache(canvasPath)` exposes them.
    // Obsidian natively resolves canvas backlinks (Backlinks pane, graph, `getBacklinksForFile`,
    // `resolvedLinks`) as of 1.12.4, but still leaves the per-file `getCache` empty for canvas
    // files — the one canvas surface the plugin still fills.
    for (const reference of references) {
      cachedMetadata.frontmatterLinks?.push(reference);
    }

    canvasMetadataCacheMap.set(file.path, cachedMetadata);
    const hash = await getFileHash(this.app, file);
    this.app.metadataCache.saveFileCache(file.path, {
      hash,
      mtime: file.stat.mtime,
      size: file.stat.size
    });
    this.app.metadataCache.saveMetaCache(hash, cachedMetadata);
  }

  private onCanvasCorePluginDisable(): void {
    this.removeCanvasMetadataCache();
    invokeAsyncSafely(async () => {
      await reloadBacklinksView(this.app);
    });
  }

  private onCanvasCorePluginEnable(): void {
    invokeAsyncSafely(async () => {
      await this.processAllCanvasFiles();
      await reloadBacklinksView(this.app);
    });
  }

  private async processAllCanvasFiles(): Promise<void> {
    await loop({
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: ({ item, iterationString }) => `Processing backlinks ${iterationString} - ${item.path}`,
      items: this.app.vault.getFiles().filter((file) => isCanvasFile(file)),
      pluginNoticeComponent: this.pluginNoticeComponent,
      processItem: async (canvasFile) => {
        await this.initCanvasMetadataCache(canvasFile);
        this.backlinkCacheComponent.triggerRefresh(canvasFile.path);
      },
      progressBarTitle: 'Backlink Cache: Processing canvas files...',
      shouldContinueOnError: true,
      shouldShowNotice: this.pluginSettingsComponent.settings.shouldShowProgressBarOnLoad
    });
  }

  private removeCanvasMetadataCache(): void {
    const canvasFiles = this.app.vault.getFiles().filter((file) => isCanvasFile(file));
    for (const file of canvasFiles) {
      if (this.abortSignalComponent.abortSignal.aborted) {
        return;
      }
      this.app.metadataCache.deletePath(file.path);
      this.backlinkCacheComponent.triggerRemove(file.path);
    }
  }
}

function arrayBufferToHexString(buffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(buffer);
  const hexArray = [];

  for (const byte of uint8Array) {
    // eslint-disable-next-line no-bitwise, no-magic-numbers -- Magic numbers are OK in this case.
    hexArray.push((byte >>> 4).toString(16), (byte & 0x0F).toString(16));
  }

  return hexArray.join('');
}

async function getFileHash(app: App, file: TFile): Promise<string> {
  const bytes = await app.vault.readBinary(file);
  // eslint-disable-next-line n/no-unsupported-features/node-builtins -- crypto.subtle is the Web Crypto API, available in Obsidian's Electron renderer; the rule incorrectly flags it as a Node experimental builtin.
  const cryptoBytes = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return arrayBufferToHexString(cryptoBytes);
}
