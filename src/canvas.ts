import type {
  App,
  CachedMetadata,
  TAbstractFile
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type {
  CanvasFileNodeReference,
  CanvasReference,
  CanvasTextNodeReference
} from 'obsidian-dev-utils/obsidian/reference';
import type { CanvasData } from 'obsidian/canvas.d.ts';

import { InternalPluginName } from '@obsidian-typings/obsidian-public-latest/implementations';
import { TFile } from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import { isCanvasFile } from 'obsidian-dev-utils/obsidian/file-system';
import { splitSubpath } from 'obsidian-dev-utils/obsidian/link';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import { getAllLinks } from 'obsidian-dev-utils/obsidian/metadata-cache';

import type { BacklinkCacheComponent } from './backlink-cache-component.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { reloadBacklinksView } from './backlink-core-plugin.ts';
import { parseMetadataEx } from './metadata.ts';

export function isCanvasPluginEnabled(app: App): boolean {
  return !!app.internalPlugins.getEnabledPluginById(InternalPluginName.Canvas);
}

const canvasMetadataCacheMap = new Map<string, CachedMetadata>();

interface CanvasComponentConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly app: App;
  readonly backlinkCacheComponent: BacklinkCacheComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class CanvasComponent extends ComponentEx {
  private readonly abortSignalComponent: AbortSignalComponent;
  private readonly app: App;
  private readonly backlinkCacheComponent: BacklinkCacheComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: CanvasComponentConstructorParams) {
    super();

    this.app = params.app;
    this.abortSignalComponent = params.abortSignalComponent;
    this.backlinkCacheComponent = params.backlinkCacheComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public override onload(): void {
    const patch = this.addChild(new MonkeyAroundComponent());
    patch.registerMethodPatch({
      methodName: 'getCache',
      obj: this.app.metadataCache,
      patchHandler: ({
        fallback,
        originalArgs: [path]
      }) => {
        if (isCanvasFile(this.app, path)) {
          return canvasMetadataCacheMap.get(path) ?? null;
        }

        return fallback();
      }
    });

    this.registerEvent(this.app.vault.on('create', this.handleFileCreateOrModify.bind(this)));
    this.registerEvent(this.app.vault.on('modify', this.handleFileCreateOrModify.bind(this)));
    this.registerEvent(this.app.vault.on('delete', this.handleFileDelete.bind(this)));
    this.registerEvent(this.app.vault.on('rename', this.handleFileRename.bind(this)));

    const canvasCorePlugin = this.app.internalPlugins.getPluginById(InternalPluginName.Canvas);
    if (!canvasCorePlugin) {
      return;
    }

    patch.registerMethodPatch({
      methodName: 'onUserDisable',
      obj: getPrototypeOf(canvasCorePlugin.instance),
      patchHandler: () => {
        this.onCanvasCorePluginDisable();
      }
    });

    patch.registerMethodPatch({
      methodName: 'onUserEnable',
      obj: getPrototypeOf(canvasCorePlugin.instance),
      patchHandler: () => {
        this.onCanvasCorePluginEnable();
      }
    });

    if (canvasCorePlugin.enabled) {
      this.onCanvasCorePluginEnable();
    }

    this.register(() => {
      this.onCanvasCorePluginDisable();
    });
  }

  private handleFileCreateOrModify(file: TAbstractFile): void {
    if (!isCanvasFile(this.app, file) || !(file instanceof TFile)) {
      return;
    }
    invokeAsyncSafely(async () => {
      await this.initCanvasMetadataCache(file);
      this.backlinkCacheComponent.triggerRefresh(file.path);
    });
  }

  private handleFileDelete(file: TAbstractFile): void {
    if (!isCanvasFile(this.app, file)) {
      return;
    }
    canvasMetadataCacheMap.delete(file.path);
  }

  private handleFileRename(file: TAbstractFile, oldPath: string): void {
    if (!isCanvasFile(this.app, file)) {
      return;
    }
    const canvasMetadataCache = canvasMetadataCacheMap.get(oldPath);
    if (canvasMetadataCache) {
      canvasMetadataCacheMap.set(file.path, canvasMetadataCache);
    }
    canvasMetadataCacheMap.delete(oldPath);
  }

  private async initCanvasMetadataCache(file: TFile): Promise<void> {
    if (!isCanvasFile(this.app, file)) {
      return;
    }

    let partialCanvasData: Partial<CanvasData>;

    try {
      const canvasJson = await this.app.vault.read(file);
      partialCanvasData = JSON.parse(canvasJson) as Partial<CanvasData>;
    } catch {
      partialCanvasData = {};
    }

    const canvasData = partialCanvasData.nodes
      ? partialCanvasData as CanvasData
      : {
        edges: [],
        nodes: []
      };

    const cachedMetadata: CachedMetadata = {
      frontmatterLinks: []
    };

    for (let index = 0; index < canvasData.nodes.length; index++) {
      const node = canvasData.nodes[index];
      switch (node?.type) {
        case 'file': {
          const canvasFileNodeReference: CanvasFileNodeReference = {
            isCanvas: true,
            key: `nodes.${String(index)}.file`,
            link: node.file,
            nodeIndex: index,
            original: node.file,
            type: 'file'
          };

          addCanvasMetadata(this.app, cachedMetadata, canvasFileNodeReference, file.path);
          break;
        }
        case 'text': {
          const metadata = await parseMetadataEx(this.app, node.text);
          const links = getAllLinks(metadata);
          let linkIndex = 0;
          for (const link of links) {
            const canvasTextNodeReference: CanvasTextNodeReference = {
              isCanvas: true,
              key: `nodes.${String(index)}.text.${String(linkIndex)}`,
              link: link.link,
              nodeIndex: index,
              original: link.original,
              originalReference: link,
              type: 'text'
            };

            addCanvasMetadata(this.app, cachedMetadata, canvasTextNodeReference, file.path);
            linkIndex++;
          }
          break;
        }
        default:
          break;
      }
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
      buildNoticeMessage: (canvasFile, iterationStr) => `Processing backlinks ${iterationStr} - ${canvasFile.path}`,
      items: this.app.vault.getFiles().filter((file) => isCanvasFile(this.app, file)),
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
    const canvasFiles = this.app.vault.getFiles().filter((file) => isCanvasFile(this.app, file));
    for (const file of canvasFiles) {
      if (this.abortSignalComponent.abortSignal.aborted) {
        return;
      }
      this.app.metadataCache.deletePath(file.path);
      this.backlinkCacheComponent.triggerRemove(file.path);
    }
  }
}

function addCanvasMetadata(app: App, cachedMetadata: CachedMetadata, reference: CanvasReference, canvasPath: string): void {
  cachedMetadata.frontmatterLinks?.push(reference);

  const linkPath = splitSubpath(reference.link).linkPath;

  const resolvedFile = app.metadataCache.getFirstLinkpathDest(linkPath, canvasPath);

  const linksCache = resolvedFile ? app.metadataCache.resolvedLinks : app.metadataCache.unresolvedLinks;
  linksCache[canvasPath] ??= {};
  /* v8 ignore start -- canvasPath is always set by the preceding ??= assignment. */
  const canvasLinksCache = linksCache[canvasPath] ?? {};
  /* v8 ignore stop */
  canvasLinksCache[linkPath] ??= 0;
  canvasLinksCache[linkPath]++;
}

function arrayBufferToHexString(buffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(buffer);
  const hexArray = [];

  for (const byte of uint8Array) {
    // eslint-disable-next-line no-bitwise, no-magic-numbers -- Magic numbers are OK in this case.
    hexArray.push((byte >>> 4).toString(16));
    // eslint-disable-next-line no-bitwise, no-magic-numbers -- Magic numbers are OK in this case.
    hexArray.push((byte & 0x0F).toString(16));
  }

  return hexArray.join('');
}

async function getFileHash(app: App, file: TFile): Promise<string> {
  const bytes = await app.vault.readBinary(file);
  // eslint-disable-next-line n/no-unsupported-features/node-builtins -- crypto.subtle is the Web Crypto API, available in Obsidian's Electron renderer; the rule incorrectly flags it as a Node experimental builtin.
  const cryptoBytes = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return arrayBufferToHexString(cryptoBytes);
}
