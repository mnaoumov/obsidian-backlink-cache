import type {
  App,
  CachedMetadata,
  TFile
} from 'obsidian';
import type { CanvasData } from 'obsidian/canvas.js';

import { isCanvasFile } from 'obsidian-dev-utils/obsidian/FileSystem';

export function isCanvasPluginEnabled(app: App): boolean {
  return !!app.internalPlugins.getEnabledPluginById('canvas');
}

export async function parseCanvasCache(app: App, file: TFile): Promise<CachedMetadata | null> {
  if (!isCanvasFile(file)) {
    return null;
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
  }

  return cachedMetadata;
}
