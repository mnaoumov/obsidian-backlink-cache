import type {
  App,
  Reference,
  TFile
} from 'obsidian';
import type {
  BacklinkPlugin,
  BacklinkView,
  ResultDomResult
} from 'obsidian-typings';
import type { BacklinkComponent } from 'obsidian-typings/implementations';
import type { CanvasData } from 'obsidian/canvas.js';

import { around } from 'monkey-around';
import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import { getPrototypeOf } from 'obsidian-dev-utils/Object';
import { isCanvasFile } from 'obsidian-dev-utils/obsidian/FileSystem';
import {
  getAllLinks,
  getBacklinksForFileSafe,
  parseMetadata
} from 'obsidian-dev-utils/obsidian/MetadataCache';
import {
  InternalPluginName,
  isFrontmatterLinkCache,
  isReferenceCache,
  ViewType
} from 'obsidian-typings/implementations';

import type { BacklinkCachePlugin } from './BacklinkCachePlugin.ts';

import { getFileComparer } from './FileComparer.ts';

const FILE_PREFIX = 'file: ';

interface CanvasDomResult extends Record<`canvas-${string}`, [from: number, to: number][]>, ResultDomResult {
}

export function patchBacklinksCorePlugin(plugin: BacklinkCachePlugin): void {
  const app = plugin.app;
  const backlinksCorePlugin = app.internalPlugins.getPluginById(InternalPluginName.Backlink);
  if (!backlinksCorePlugin) {
    return;
  }

  plugin.register(around(getPrototypeOf(backlinksCorePlugin.instance), {
    onUserEnable: (next: () => void) =>
      function onUserEnablePatched(this: BacklinkPlugin): void {
        next.call(this);
        onBacklinksCorePluginEnable(plugin);
      }
  }));

  if (backlinksCorePlugin.enabled) {
    onBacklinksCorePluginEnable(plugin);
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

function onBacklinksCorePluginEnable(plugin: BacklinkCachePlugin): void {
  invokeAsyncSafely(() => patchBacklinksPane(plugin));
}

async function patchBacklinksPane(plugin: BacklinkCachePlugin): Promise<void> {
  const app = plugin.app;
  const backlinkView = await getBacklinkView(app);
  if (!backlinkView) {
    return;
  }

  plugin.register(around(getPrototypeOf(backlinkView.backlink), {
    recomputeBacklink: () =>
      function recomputeBacklinkPatched(this: BacklinkComponent, backlinkFile: null | TFile): void {
        invokeAsyncSafely(async () => {
          await recomputeBacklinkAsync(this, backlinkFile);
        });
      }
  }));
}

function patchCanvasContent(canvasData: CanvasData): string {
  const patched: CanvasData = {
    edges: canvasData.edges,
    nodes: []
  };

  patched.nodes = canvasData.nodes.map((node) => {
    if (node.type === 'file') {
      return {
        ...node,
        text: `${FILE_PREFIX}${node.file}`,
        type: 'text'
      };
    }

    return node;
  });
  return JSON.stringify(patched);
}

async function recomputeBacklinkAsync(backlinkComponent: BacklinkComponent, backlinkFile: null | TFile): Promise<void> {
  const app = backlinkComponent.app;
  backlinkComponent.stopBacklinkSearch();
  if (backlinkComponent.backlinkCollapsed) {
    backlinkComponent.backlinkCountEl.hide();
    return;
  }

  backlinkComponent.backlinkFile = backlinkFile;
  backlinkComponent.backlinkCountEl.show();
  backlinkComponent.backlinkCountEl.setText('0');
  backlinkComponent.backlinkDom.emptyResults();
  if (!backlinkFile) {
    return;
  }

  const backlinks = await getBacklinksForFileSafe(app, backlinkFile);
  backlinkComponent.backlinkCountEl.setText(backlinks.count().toString());
  backlinkComponent.backlinkDom.changed();
  backlinkComponent.backlinkDom.emptyResults();

  const backlinkNoteFiles = backlinks.keys().map((path) => app.vault.getFileByPath(path)).filter((file) => !!file);
  backlinkNoteFiles.sort(getFileComparer(backlinkComponent.backlinkDom.sortOrder));

  for (const backlinkNoteFile of backlinkNoteFiles) {
    await showBacklinks(backlinkComponent, backlinkNoteFile, backlinks.get(backlinkNoteFile.path) ?? []);
  }
}

async function showBacklinks(backlinkComponent: BacklinkComponent, backlinkNoteFile: TFile, links: Reference[]): Promise<void> {
  const app = backlinkComponent.app;
  let content = await app.vault.read(backlinkNoteFile);
  let canvasData: CanvasData | null = null;
  if (isCanvasFile(app, backlinkNoteFile)) {
    canvasData = JSON.parse(content) as CanvasData;
    content = patchCanvasContent(canvasData);
  }

  const resultDomResult: CanvasDomResult = {
    content: [],
    properties: []
  };
  let isValidLink = false;

  for (const link of links) {
    if (isReferenceCache(link)) {
      resultDomResult.content.push([link.position.start.offset, link.position.end.offset]);
      isValidLink = true;
    } else if (isFrontmatterLinkCache(link)) {
      const keys = link.key.split('.');
      resultDomResult.properties.push({
        key: keys[0] ?? '',
        pos: [0, link.original.length],
        subkey: keys.slice(1).map((key) => Number.isNaN(Number(key)) ? key : Number(key))
      });
      isValidLink = true;

      if (isCanvasFile(app, backlinkNoteFile)) {
        const nodeIndex = keys[1] as number | undefined;
        if (nodeIndex !== undefined) {
          const node = canvasData?.nodes[nodeIndex];
          if (node) {
            let canvasNodeMatches = resultDomResult[`canvas-${node.id}`];
            if (!canvasNodeMatches) {
              canvasNodeMatches = [];
              resultDomResult[`canvas-${node.id}`] = canvasNodeMatches;
            }

            switch (node.type) {
              case 'file':
                canvasNodeMatches.push([FILE_PREFIX.length, FILE_PREFIX.length + node.file.length]);
                break;
              case 'text': {
                const LINK_INDEX_KEY_INDEX = 3;
                const metadata = await parseMetadata(app, node.text);
                const parsedLinks = getAllLinks(metadata);
                const linkIndex = keys[LINK_INDEX_KEY_INDEX] as number | undefined;
                if (linkIndex !== undefined) {
                  const parsedLink = parsedLinks[linkIndex];

                  if (parsedLink) {
                    if (isReferenceCache(parsedLink)) {
                      canvasNodeMatches.push([parsedLink.position.start.offset, parsedLink.position.end.offset]);
                    } else {
                      canvasNodeMatches.push([node.text.indexOf(parsedLink.original), node.text.indexOf(parsedLink.original) + parsedLink.original.length]);
                    }
                  }
                }
                break;
              }
              default:
                break;
            }
          }
        }
      }
    }

    if (isValidLink) {
      backlinkComponent.backlinkDom.addResult(backlinkNoteFile, resultDomResult, content).renderContentMatches();
    }
  }

  backlinkComponent.backlinkCountEl.setText(backlinkComponent.backlinkDom.getMatchCount().toString());
}
