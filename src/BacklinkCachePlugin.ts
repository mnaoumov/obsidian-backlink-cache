import { CustomArrayDictImpl } from "obsidian-typings/implementations";
import { setOriginalFunc } from "./OriginalFunc.ts";
import {
  type LinkCache,
  Notice,
  Plugin,
  TAbstractFile,
  TFile
} from "obsidian";
import type { CustomArrayDict } from "obsidian-typings";
import { getCacheSafe } from "./MetadataCache.ts";

const INTERVAL_IN_MILLISECONDS = 5000;

enum Action {
  Refresh,
  Remove
}

export default class BacklinkCachePlugin extends Plugin {
  private readonly linksMap = new Map<string, Set<string>>();
  private readonly backlinksMap = new Map<string, Map<string, Set<LinkCache>>>();
  private readonly pendingActions = new Map<string, Action>();

  public override onload(): void {
    this.app.workspace.onLayoutReady(this.onLayoutReady.bind(this));
  }

  private async onLayoutReady(): Promise<void> {
    const noteFiles = this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
    const notice = new Notice("", 0);
    let i = 0;
    for (const noteFile of noteFiles) {
      i++;
      const message = `Processing backlinks # ${i} / ${noteFiles.length} - ${noteFile.path}`;
      console.debug(message);
      notice.setMessage(message);
      await this.refreshBacklinks(noteFile.path);
    }
    notice.hide();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalFunc = this.app.metadataCache.getBacklinksForFile;
    this.app.metadataCache.getBacklinksForFile = this.getBacklinksForFile.bind(this);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    setOriginalFunc(this.app.metadataCache.getBacklinksForFile, originalFunc.bind(this.app.metadataCache));
    this.registerEvent(this.app.metadataCache.on("changed", this.handleMetadataChanged.bind(this)));
    this.registerEvent(this.app.vault.on("rename", this.handleFileRename.bind(this)));
    this.registerEvent(this.app.vault.on("delete", this.handleFileDelete.bind(this)));
    this.register(() => {
      this.app.metadataCache.getBacklinksForFile = originalFunc;
    });
    this.registerInterval(window.setInterval(() => void this.processPendingActions().catch(console.error), INTERVAL_IN_MILLISECONDS));
  }

  private async processPendingActions(): Promise<void> {
    const pathActions = Array.from(this.pendingActions.entries());
    this.pendingActions.clear();

    for (const [path, action] of pathActions) {
      switch (action) {
        case Action.Refresh:
          await this.refreshBacklinks(path);
          break;
        case Action.Remove:
          this.removeBacklinks(path);
          break;
      }
    }
  }

  private async refreshBacklinks(notePath: string): Promise<void> {
    console.debug(`Refreshing backlinks for ${notePath}`);
    this.removeLinkedPathEntries(notePath);

    const noteFile = this.app.vault.getFileByPath(notePath);

    if (!noteFile) {
      return;
    }

    if (!this.linksMap.has(notePath)) {
      this.linksMap.set(notePath, new Set<string>());
    }

    const cache = await getCacheSafe(this.app, noteFile);

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

      let notePathLinksMap = this.backlinksMap.get(linkFile.path);

      if (!notePathLinksMap) {
        notePathLinksMap = new Map<string, Set<LinkCache>>();
        this.backlinksMap.set(linkFile.path, notePathLinksMap);
      }

      let linkSet = notePathLinksMap.get(notePath);

      if (!linkSet) {
        linkSet = new Set<LinkCache>();
        notePathLinksMap.set(notePath, linkSet);
      }

      linkSet.add(link);
      this.linksMap.get(notePath)?.add(linkFile.path);
    }
  }

  private removeBacklinks(path: string): void {
    console.debug(`Removing backlinks for ${path}`);
    this.removePathEntries(path);
  }

  private handleMetadataChanged(file: TFile): void {
    this.pendingActions.set(file.path, Action.Refresh);
  }

  private handleFileRename(file: TAbstractFile, oldPath: string): void {
    this.pendingActions.set(oldPath, Action.Remove);
    this.pendingActions.set(file.path, Action.Refresh);
  }

  private handleFileDelete(file: TAbstractFile): void {
    this.pendingActions.set(file.path, Action.Remove);
  }

  private removePathEntries(path: string): void {
    console.debug(`Removing ${path} entries`);
    this.backlinksMap.delete(path);
    this.removeLinkedPathEntries(path);
  }

  private removeLinkedPathEntries(path: string): void {
    const linkedNotePaths = this.linksMap.get(path) || [];

    for (const linkedNotePath of linkedNotePaths) {
      this.backlinksMap.get(linkedNotePath)?.delete(path);
    }

    this.linksMap.delete(path);
  }

  private getBacklinksForFile(file?: TFile): CustomArrayDict<LinkCache> {
    const notePathLinksMap = this.backlinksMap.get(file?.path ?? "") || new Map<string, Set<LinkCache>>();
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
}
