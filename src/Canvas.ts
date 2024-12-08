import type {
  App,
  CachedMetadata,
  TAbstractFile,
  TFile
} from 'obsidian';
import type {
  BacklinkPlugin,
  BacklinkView
} from 'obsidian-typings';
import type { CanvasData } from 'obsidian/canvas.js';

import { around } from 'monkey-around';
import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import { getPrototypeOf } from 'obsidian-dev-utils/Object';
import { isCanvasFile } from 'obsidian-dev-utils/obsidian/FileSystem';
import { getNoteFilesSorted } from 'obsidian-dev-utils/obsidian/Vault';

import type { BacklinkCachePlugin } from './BacklinkCachePlugin.ts';

export function isCanvasPluginEnabled(app: App): boolean {
  return !!app.internalPlugins.getEnabledPluginById('canvas');
}

const canvasMetadataCacheMap = new Map<string, CachedMetadata>();

export async function initCanvasMetadataCache(app: App, file: TFile): Promise<void> {
  if (!isCanvasFile(file)) {
    return;
  }

  const canvasData = await app.vault.readJson(file.path) as CanvasData;

  const cachedMetadata: CachedMetadata = {
    frontmatterLinks: []
  };

  for (let index = 0; index < canvasData.nodes.length; index++) {
    const node = canvasData.nodes[index];
    if (node?.type !== 'file') {
      continue;
    }
    cachedMetadata.frontmatterLinks?.push({
      key: `nodes.${index.toString()}.file`,
      link: node.file,
      original: node.file
    });

    const resolvedFile = app.metadataCache.getFirstLinkpathDest(node.file, file.path);

    const linksCache = resolvedFile ? app.metadataCache.resolvedLinks : app.metadataCache.unresolvedLinks;
    const canvasLinksCache = linksCache[file.path] ??= {};
    canvasLinksCache[node.file] = (canvasLinksCache[node.file] ?? 0) + 1;
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

export function patchForCanvas(plugin: BacklinkCachePlugin): void {
  const app = plugin.app;
  plugin.register(around(app.metadataCache, {
    getCache: (next: (path: string) => CachedMetadata | null) => (path): CachedMetadata | null => getCache(app, path, next)
  }));
  patchBacklinksPlugin(plugin);

  plugin.registerEvent(app.vault.on('create', (file) => {
    handleFileCreateOrModify(file, plugin);
  }));
  plugin.registerEvent(app.vault.on('modify', (file) => {
    handleFileCreateOrModify(file, plugin);
  }));
  plugin.registerEvent(app.vault.on('delete', (file) => {
    handleFileDelete(file);
  }));
  plugin.registerEvent(app.vault.on('rename', (file, oldPath) => {
    handleFileRename(file, oldPath);
  }));
}

function arrayBufferToHexString(buffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(buffer);
  const hexArray = [];

  for (const byte of uint8Array) {
    hexArray.push((byte >>> 4).toString(16));
    hexArray.push((byte & 0x0F).toString(16));
  }

  return hexArray.join('');
}

function getCache(app: App, path: string, next: (path: string) => CachedMetadata | null): CachedMetadata | null {
  if (isCanvasFile(path)) {
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
  if (!isCanvasFile(file)) {
    return;
  }
  invokeAsyncSafely(async () => {
    await initCanvasMetadataCache(plugin.app, file as TFile);
    plugin.triggerRefresh(file.path);
  });
}

function handleFileDelete(file: TAbstractFile): void {
  if (!isCanvasFile(file)) {
    return;
  }
  canvasMetadataCacheMap.delete(file.path);
}

function handleFileRename(file: TAbstractFile, oldPath: string): void {
  if (!isCanvasFile(file)) {
    return;
  }
  const canvasMetadataCache = canvasMetadataCacheMap.get(oldPath);
  if (canvasMetadataCache) {
    canvasMetadataCacheMap.set(file.path, canvasMetadataCache);
  }
  canvasMetadataCacheMap.delete(oldPath);
}

async function patchBacklinksPane(plugin: BacklinkCachePlugin): Promise<void> {
  const app = plugin.app;
  const backlinksLeaf = app.workspace.getLeavesOfType('backlink')[0];
  if (!backlinksLeaf) {
    return;
  }

  await backlinksLeaf.loadIfDeferred();
  const backlinkView = backlinksLeaf.view as BacklinkView;

  plugin.register(around(getPrototypeOf(backlinkView.backlink), {
    recomputeBacklink: (next: (backlinkFile: TFile) => void) => function (this: BacklinkView['backlink'], backlinkFile: TFile): void {
      recomputeBacklink(app, backlinkFile, this, next);
    }
  }));
}

function patchBacklinksPlugin(plugin: BacklinkCachePlugin): void {
  const app = plugin.app;
  const backlinkPlugin = app.internalPlugins.getPluginById('backlink');
  if (!backlinkPlugin) {
    return;
  }

  plugin.register(around(getPrototypeOf(backlinkPlugin.instance), {
    onUserEnable: (next: () => void) => function (this: BacklinkPlugin): void {
      next.call(this);
      invokeAsyncSafely(() => patchBacklinksPane(plugin));
    }
  }));

  if (backlinkPlugin.enabled) {
    invokeAsyncSafely(() => patchBacklinksPane(plugin));
  }
}

function recomputeBacklink(app: App, backlinkFile: TFile, backlink: BacklinkView['backlink'], next: (backlinkFile: TFile) => void): void {
  const uninstallGetMarkdownFilesPatch = around(app.vault, {
    getMarkdownFiles: (): () => TFile[] => () => getNoteFilesSorted(app)
  });
  try {
    next.call(backlink, backlinkFile);
  } finally {
    uninstallGetMarkdownFilesPatch();
  }
}
