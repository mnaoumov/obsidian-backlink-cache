import type { BacklinkComponent } from '@obsidian-typings/obsidian-public-latest/implementations';
import type {
  Reference,
  TFile
} from 'obsidian';
import type { CanvasData } from 'obsidian/canvas.js';

import {
  isFrontmatterLinkCache,
  isReferenceCache
} from '@obsidian-typings/obsidian-public-latest/implementations';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import { isCanvasFile } from 'obsidian-dev-utils/obsidian/file-system';
import { isFrontmatterLinkCacheWithOffsets } from 'obsidian-dev-utils/obsidian/frontmatter-link-cache-with-offsets';
import { getBacklinksForFileSafe } from 'obsidian-dev-utils/obsidian/metadata-cache';
import {
  isCanvasFileNodeReference,
  isCanvasReference,
  isCanvasTextNodeReference
} from 'obsidian-dev-utils/obsidian/reference';

import type { CanvasDomResult } from '../backlink-core-plugin.ts';

import { getFileComparer } from '../file-comparer.ts';

interface BacklinkComponentRecomputeBacklinkPatchComponentConstructorParams {
  readonly backlinkComponent: BacklinkComponent;
}

export class BacklinkComponentRecomputeBacklinkPatchComponent extends MonkeyAroundComponent {
  private readonly backlinkComponent: BacklinkComponent;

  public constructor(params: BacklinkComponentRecomputeBacklinkPatchComponentConstructorParams) {
    super();
    this.backlinkComponent = params.backlinkComponent;
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'recomputeBacklink',
      obj: getPrototypeOf(this.backlinkComponent),
      patchHandler: ({
        originalArgs: [backlinkFile],
        originalThis
      }) => {
        invokeAsyncSafely(async () => {
          await this.recomputeBacklinkAsync(originalThis, backlinkFile);
        });
      }
    });
  }

  private async recomputeBacklinkAsync(backlinkComponent: BacklinkComponent, backlinkFile: null | TFile): Promise<void> {
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
      await this.showBacklinks(backlinkComponent, backlinkNoteFile, backlinks.get(backlinkNoteFile.path) ?? []);
    }

    backlinkComponent.backlinkCountEl.setText(backlinkComponent.backlinkDom.getMatchCount().toString());
    backlinkComponent.backlinkDom.changed();
  }

  private async showBacklinks(backlinkComponent: BacklinkComponent, backlinkNoteFile: TFile, links: Reference[]): Promise<void> {
    const app = backlinkComponent.app;
    let content = await app.vault.read(backlinkNoteFile);
    if (!backlinkComponent.passSearchFilter(backlinkNoteFile, content)) {
      return;
    }

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
      } else if (isFrontmatterLinkCacheWithOffsets(link)) {
        const keys = link.key.split('.');
        resultDomResult.properties.push({
          /* v8 ignore start -- split('.') always returns at least one element. */
          key: keys[0] ?? '',
          /* v8 ignore stop */
          pos: [link.startOffset, link.endOffset],
          subkey: keys.slice(1).map((key) => Number.isNaN(Number(key)) ? key : Number(key))
        });
        isValidLink = true;
      } else if (isFrontmatterLinkCache(link)) {
        const keys = link.key.split('.');
        resultDomResult.properties.push({
          /* v8 ignore start -- split('.') always returns at least one element. */
          key: keys[0] ?? '',
          /* v8 ignore stop */
          pos: [0, link.original.length],
          subkey: keys.slice(1).map((key) => Number.isNaN(Number(key)) ? key : Number(key))
        });
        isValidLink = true;

        if (isCanvasFile(app, backlinkNoteFile)) {
          if (!isCanvasReference(link)) {
            console.warn('Unknown link type', {
              link
            });
            continue;
          }

          const node = canvasData?.nodes[link.nodeIndex];
          if (!node) {
            console.warn('Node not found', {
              link
            });
            continue;
          }

          let canvasNodeMatches = resultDomResult[`canvas-${node.id}`];
          if (!canvasNodeMatches) {
            canvasNodeMatches = [];
            resultDomResult[`canvas-${node.id}`] = canvasNodeMatches;
          }

          if (isCanvasFileNodeReference(link)) {
            if (typeof node.file !== 'string') {
              console.warn('Node file is not a string', {
                link,
                node
              });
              continue;
            }

            canvasNodeMatches.push([FILE_PREFIX.length, FILE_PREFIX.length + node.file.length]);
          } else if (isCanvasTextNodeReference(link)) {
            if (typeof node.text !== 'string') {
              console.warn('Node text is not a string', {
                link,
                node
              });
              continue;
            }

            if (isReferenceCache(link.originalReference)) {
              canvasNodeMatches.push([link.originalReference.position.start.offset, link.originalReference.position.end.offset]);
            } else {
              const index = node.text.indexOf(link.originalReference.original);
              canvasNodeMatches.push([index, index + link.originalReference.original.length]);
            }
          } else {
            console.warn('Unknown link type', {
              link
            });
            continue;
          }
        }
      }

      if (isValidLink) {
        backlinkComponent.backlinkDom.addResult(backlinkNoteFile, resultDomResult, content).renderContentMatches();
      }
    }
  }
}
export const FILE_PREFIX = 'file: ';
export function patchCanvasContent(canvasData: CanvasData): string {
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
