import type {
  App,
  CachedMetadata,
  TAbstractFile,
  TFile
} from 'obsidian';
import type { CanvasData } from 'obsidian/canvas.js';

import { around } from 'monkey-around';
import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import { getPrototypeOf } from 'obsidian-dev-utils/Object';
import { isCanvasFile } from 'obsidian-dev-utils/obsidian/FileSystem';
import { splitSubpath } from 'obsidian-dev-utils/obsidian/Link';
import { loop } from 'obsidian-dev-utils/obsidian/Loop';
import { getAllLinks } from 'obsidian-dev-utils/obsidian/MetadataCache';
import { InternalPluginName} from 'obsidian-typings/implementations';

import type { BacklinkCachePlugin } from './BacklinkCachePlugin.ts';

import { reloadBacklinksView } from './BacklinkCorePlugin.ts';

export function isCanvasPluginEnabled(app: App): boolean {
  return !!app.internalPlugins.getEnabledPluginById('canvas');
}

const canvasMetadataCacheMap = new Map<string, CachedMetadata>();

type GetCacheFn = (path: string) => CachedMetadata | null;

export function initCanvasHandlers(plugin: BacklinkCachePlugin): void {
  const app = plugin.app;
  plugin.register(around(app.metadataCache, {
    getCache: (next: GetCacheFn) => (path): CachedMetadata | null => getCache(app, path, next)
  }));

  plugin.registerEvent(app.vault.on('create', (file) => {
    handleFileCreateOrModify(file, plugin);
  }));
  plugin.registerEvent(app.vault.on('modify', (file) => {
    handleFileCreateOrModify(file, plugin);
  }));
  plugin.registerEvent(app.vault.on('delete', (file) => {
    handleFileDelete(file, plugin);
  }));
  plugin.registerEvent(app.vault.on('rename', (file, oldPath) => {
    handleFileRename(file, oldPath, plugin);
  }));

  const canvasCorePlugin = app.internalPlugins.getPluginById(InternalPluginName.Canvas);
  if (!canvasCorePlugin) {
    return;
  }

  plugin.register(around(getPrototypeOf(canvasCorePlugin.instance), {
    onUserDisable: () => (): void => {
      onCanvasCorePluginDisable(plugin);
    },
    onUserEnable: () => (): void => {
      onCanvasCorePluginEnable(plugin);
    }
  }));

  if (canvasCorePlugin.enabled) {
    onCanvasCorePluginEnable(plugin);
  }

  plugin.register(() => {
    onCanvasCorePluginDisable(plugin);
  });
}

export async function initCanvasMetadataCache(app: App, file: TFile): Promise<void> {
  if (!isCanvasFile(app, file)) {
    return;
  }

  let partialCanvasData: Partial<CanvasData>;

  try {
    const canvasJson = await app.vault.read(file);
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
      case 'file':
        addCanvasMetadata(app, cachedMetadata, `nodes.${index.toString()}.file`, node.file, node.file, file.path);
        break;
      case 'text': {
        const text = node.text;
        const encoder = new TextEncoder();
        const buffer = encoder.encode(text).buffer as ArrayBuffer;
        const metadata = await app.metadataCache.computeMetadataAsync(buffer);
        if (metadata) {
          const links = getAllLinks(metadata);
          let linkIndex = 0;
          for (const link of links) {
            addCanvasMetadata(app, cachedMetadata, `nodes.${index.toString()}.text.${linkIndex.toString()}`, link.link, link.original, file.path);
            linkIndex++;
          }
        }
        break;
      }
      default:
        break;
    }
  }

  canvasMetadataCacheMap.set(file.path, cachedMetadata);
  const hash = await getFileHash(app, file);
  app.metadataCache.saveFileCache(file.path, {
    hash,
    mtime: file.stat.mtime,
    size: file.stat.size
  });
  app.metadataCache.saveMetaCache(hash, cachedMetadata);
}

function addCanvasMetadata(app: App, cachedMetadata: CachedMetadata, key: string, link: string, original: string, canvasPath: string): void {
  cachedMetadata.frontmatterLinks?.push({
    key,
    link,
    original
  });

  const linkPath = splitSubpath(link).linkPath;

  const resolvedFile = app.metadataCache.getFirstLinkpathDest(linkPath, canvasPath);

  const linksCache = resolvedFile ? app.metadataCache.resolvedLinks : app.metadataCache.unresolvedLinks;
  linksCache[canvasPath] ??= {};
  const canvasLinksCache = linksCache[canvasPath] ?? {};
  canvasLinksCache[linkPath] ??= 0;
  canvasLinksCache[linkPath]++;
}

function arrayBufferToHexString(buffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(buffer);
  const hexArray = [];

  for (const byte of uint8Array) {
    // eslint-disable-next-line no-bitwise, no-magic-numbers
    hexArray.push((byte >>> 4).toString(16));
    // eslint-disable-next-line no-bitwise, no-magic-numbers
    hexArray.push((byte & 0x0F).toString(16));
  }

  return hexArray.join('');
}

function getCache(app: App, path: string, next: GetCacheFn): CachedMetadata | null {
  if (isCanvasFile(app, path)) {
    return canvasMetadataCacheMap.get(path) ?? null;
  }

  return next.call(app.metadataCache, path);
}

async function getFileHash(app: App, file: TFile): Promise<string> {
  const bytes = await app.vault.readBinary(file);
  const cryptoBytes = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return arrayBufferToHexString(cryptoBytes);
}

function handleFileCreateOrModify(file: TAbstractFile, plugin: BacklinkCachePlugin): void {
  if (!isCanvasFile(plugin.app, file)) {
    return;
  }
  invokeAsyncSafely(async () => {
    await initCanvasMetadataCache(plugin.app, file as TFile);
    plugin.triggerRefresh(file.path);
  });
}

function handleFileDelete(file: TAbstractFile, plugin: BacklinkCachePlugin): void {
  if (!isCanvasFile(plugin.app, file)) {
    return;
  }
  canvasMetadataCacheMap.delete(file.path);
}

function handleFileRename(file: TAbstractFile, oldPath: string, plugin: BacklinkCachePlugin): void {
  if (!isCanvasFile(plugin.app, file)) {
    return;
  }
  const canvasMetadataCache = canvasMetadataCacheMap.get(oldPath);
  if (canvasMetadataCache) {
    canvasMetadataCacheMap.set(file.path, canvasMetadataCache);
  }
  canvasMetadataCacheMap.delete(oldPath);
}

function onCanvasCorePluginDisable(plugin: BacklinkCachePlugin): void {
  removeCanvasMetadataCache(plugin);
  invokeAsyncSafely(async () => {
    await reloadBacklinksView(plugin.app);
  });
}

function onCanvasCorePluginEnable(plugin: BacklinkCachePlugin): void {
  invokeAsyncSafely(async () => {
    await processAllCanvasFiles(plugin);
    await reloadBacklinksView(plugin.app);
  });
}

async function processAllCanvasFiles(plugin: BacklinkCachePlugin): Promise<void> {
  await loop({
    abortSignal: plugin.abortSignal,
    buildNoticeMessage: (canvasFile, iterationStr) => `Processing backlinks ${iterationStr} - ${canvasFile.path}`,
    items: plugin.app.vault.getFiles().filter((file) => isCanvasFile(plugin.app, file)),
    processItem: async (canvasFile) => {
      await initCanvasMetadataCache(plugin.app, canvasFile);
      plugin.triggerRefresh(canvasFile.path);
    },
    shouldContinueOnError: true
  });
}

function removeCanvasMetadataCache(plugin: BacklinkCachePlugin): void {
  const app = plugin.app;
  const canvasFiles = app.vault.getFiles().filter((file) => isCanvasFile(app, file));
  for (const file of canvasFiles) {
    app.metadataCache.deletePath(file.path);
    plugin.triggerRemove(file.path);
  }
}
