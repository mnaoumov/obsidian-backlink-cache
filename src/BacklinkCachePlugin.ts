import CustomArrayDictImpl from "./CustomArrayDictImpl.ts";
import { setOriginalFunc } from "./OriginalFunc.ts";
import {
  debounce,
  type CachedMetadata,
  type LinkCache,
  Plugin,
  TAbstractFile,
  TFile
} from "obsidian";
import type { CustomArrayDict } from "obsidian-typings";

const DEBOUNCE_TIMEOUT_IN_MILLISECONDS = 60000;

export default class BacklinkCachePlugin extends Plugin {
  private readonly _linksMap = new Map<string, Set<string>>();
  private readonly _backlinksMap = new Map<string, Map<string, Set<LinkCache>>>();
  private readonly _handlersQueue: (() => void)[] = [];
  private readonly processHandlersQueueDebounced = debounce(this.processHandlersQueue.bind(this), DEBOUNCE_TIMEOUT_IN_MILLISECONDS);

  public override onload(): void {
    this.app.workspace.onLayoutReady(this.onLayoutReady.bind(this));
  }

  private onLayoutReady(): void {
    const noteFiles = this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
    console.log(`Processing ${noteFiles.length} note files`);
    let i = 0;
    for (const noteFile of noteFiles) {
      i++;
      console.debug(`Processing ${i} / ${noteFiles.length} - ${noteFile.path}`);
      const cache = this.app.metadataCache.getFileCache(noteFile);
      if (cache) {
        this.processBacklinks(cache, noteFile.path);
      }
    }

    const originalFunc = this.app.metadataCache.getBacklinksForFile;
    this.app.metadataCache.getBacklinksForFile = this.getBacklinksForFile.bind(this);
    setOriginalFunc(this.app.metadataCache.getBacklinksForFile, originalFunc.bind(this.app.metadataCache));
    this.registerEvent(this.app.metadataCache.on("changed", this.makeDebounced(this.handleMetadataChanged.bind(this))));
    this.registerEvent(this.app.vault.on("rename", this.makeDebounced(this.handleFileRename.bind(this))));
    this.registerEvent(this.app.vault.on("delete", this.makeDebounced(this.handleFileDelete.bind(this))));
    this.register(() => {
      this.app.metadataCache.getBacklinksForFile = originalFunc;
    });
  }

  private makeDebounced<T extends unknown[]>(handler: (...args: T) => void): (...args: T) => void {
    return (...args) => {
      this._handlersQueue.push(() => handler(...args));
      this.processHandlersQueueDebounced();
    };
  }

  private processHandlersQueue(): void {
    while (true) {
      const handler = this._handlersQueue.shift();
      if (!handler) {
        return;
      }

      handler();
    }
  }

  private handleMetadataChanged(file: TFile, _data: string, cache: CachedMetadata): void {
    console.debug(`Handling cache change for ${file.path}`);
    this.removeLinkedPathEntries(file.path);
    this.processBacklinks(cache, file.path);
  }

  private handleFileRename(file: TAbstractFile, oldPath: string): void {
    console.debug(`Handling rename from ${oldPath} to ${file.path}`);
    this.removePathEntries(oldPath);

    if (file instanceof TFile) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache) {
        this.processBacklinks(cache, file.path);
      }
    }
  }

  private handleFileDelete(file: TAbstractFile): void {
    console.debug(`Handling deletion ${file.path}`);
    this.removePathEntries(file.path);
  }

  private removePathEntries(path: string): void {
    console.debug(`Removing ${path} entries`);
    this._backlinksMap.delete(path);
    this.removeLinkedPathEntries(path);
  }

  private removeLinkedPathEntries(path: string): void {
    console.debug(`Removing linked entries for ${path}`);
    const linkedNotePaths = this._linksMap.get(path) || [];

    for (const linkedNotePath of linkedNotePaths) {
      this._backlinksMap.get(linkedNotePath)?.delete(path);
    }

    this._linksMap.delete(path);
  }

  private getBacklinksForFile(file?: TFile): CustomArrayDict<LinkCache> {
    const notePathLinksMap = this._backlinksMap.get(file?.path ?? "") || new Map<string, Set<LinkCache>>();
    const dict = new CustomArrayDictImpl<LinkCache>();

    for (const [notePath, links] of notePathLinksMap.entries()) {
      for (const link of [...links].sort((a, b) => a.position.start.offset - b.position.start.offset)) {
        dict.add(notePath, link);
      }
    }

    return dict;
  }

  private extractLinkPath(link: string): string {
    return link.replace(/\u00A0/g, " ").normalize("NFC").split("#")[0]!;
  }

  private processBacklinks(cache: CachedMetadata, notePath: string): void {
    console.debug(`Processing backlinks for ${notePath}`);

    if (!this._linksMap.has(notePath)) {
      this._linksMap.set(notePath, new Set<string>());
    }

    const allLinks: LinkCache[] = [];
    if (cache.links) {
      allLinks.push(...cache.links);
    }

    if (cache.embeds) {
      allLinks.push(...cache.embeds);
    }

    for (const link of allLinks) {
      const linkFile = this.app.metadataCache.getFirstLinkpathDest(this.extractLinkPath(link.link), notePath);
      if (!linkFile) {
        continue;
      }

      let notePathLinksMap = this._backlinksMap.get(linkFile.path);

      if (!notePathLinksMap) {
        notePathLinksMap = new Map<string, Set<LinkCache>>();
        this._backlinksMap.set(linkFile.path, notePathLinksMap);
      }

      let linkSet = notePathLinksMap.get(notePath);

      if (!linkSet) {
        linkSet = new Set<LinkCache>();
        notePathLinksMap.set(notePath, linkSet);
      }

      linkSet.add(link);
      this._linksMap.get(notePath)?.add(linkFile.path);
    }
  }
}
