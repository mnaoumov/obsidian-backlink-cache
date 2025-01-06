import type {
  Debouncer,
  Reference
} from 'obsidian';
import type { PathOrFile } from 'obsidian-dev-utils/obsidian/FileSystem';
import type { GetBacklinksForFileSafeWrapper } from 'obsidian-dev-utils/obsidian/MetadataCache';
import type { CustomArrayDict } from 'obsidian-typings';

import { around } from 'monkey-around';
import {
  debounce,
  PluginSettingTab,
  TAbstractFile,
  TFile
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import {
  getFileOrNull,
  getPath,
  isCanvasFile
} from 'obsidian-dev-utils/obsidian/FileSystem';
import { extractLinkFile } from 'obsidian-dev-utils/obsidian/Link';
import { loop } from 'obsidian-dev-utils/obsidian/Loop';
import {
  getAllLinks,
  getCacheSafe
} from 'obsidian-dev-utils/obsidian/MetadataCache';
import { EmptySettings } from 'obsidian-dev-utils/obsidian/Plugin/EmptySettings';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { sortReferences } from 'obsidian-dev-utils/obsidian/Reference';
import { getMarkdownFilesSorted } from 'obsidian-dev-utils/obsidian/Vault';
import { CustomArrayDictImpl } from 'obsidian-typings/implementations';

import {
  initCanvasHandlers,
  isCanvasPluginEnabled
} from './Canvas.ts';

const INTERVAL_IN_MILLISECONDS = 500;

enum Action {
  Refresh,
  Remove
}

type GetBacklinksForFileFn = (file: TFile) => CustomArrayDict<Reference>;

export class BacklinkCachePlugin extends PluginBase {
  private readonly backlinksMap = new Map<string, Map<string, Set<Reference>>>();

  private debouncedProcessPendingActions!: Debouncer<[], Promise<void>>;

  private readonly linksMap = new Map<string, Set<string>>();
  private readonly pendingActions = new Map<string, Action>();
  public triggerRefresh(path: string): void {
    this.setPendingAction(path, Action.Refresh);
  }

  public triggerRemove(path: string): void {
    this.setPendingAction(path, Action.Remove);
  }

  protected override createPluginSettings(): EmptySettings {
    return new EmptySettings();
  }

  protected override createPluginSettingsTab(): null | PluginSettingTab {
    return null;
  }

  protected override async onLayoutReady(): Promise<void> {
    this.register(around(this.app.metadataCache, {
      getBacklinksForFile: (next: GetBacklinksForFileFn): GetBacklinksForFileFn & GetBacklinksForFileSafeWrapper =>
        Object.assign(this.getBacklinksForFile.bind(this), {
          originalFn: next,
          safe: this.getBacklinksForFileSafe.bind(this)
        })
    }));

    this.registerEvent(this.app.metadataCache.on('changed', this.handleMetadataChanged.bind(this)));
    this.registerEvent(this.app.vault.on('rename', this.handleFileRename.bind(this)));
    this.registerEvent(this.app.vault.on('delete', this.handleFileDelete.bind(this)));
    this.debouncedProcessPendingActions = debounce(this.processPendingActions.bind(this), INTERVAL_IN_MILLISECONDS, true);
    initCanvasHandlers(this);
    await this.processAllNotes();
  }

  private getBacklinksForFile(pathOrFile: PathOrFile): CustomArrayDict<Reference> {
    const notePathLinksMap = this.backlinksMap.get(getPath(this.app, pathOrFile)) ?? new Map<string, Set<Reference>>();
    const dict = new CustomArrayDictImpl<Reference>();

    for (const [notePath, links] of notePathLinksMap.entries()) {
      for (const link of sortReferences(Array.from(links))) {
        dict.add(notePath, link);
      }
    }

    invokeAsyncSafely(this.processPendingActions.bind(this));
    return dict;
  }

  private async getBacklinksForFileSafe(pathOrFile: PathOrFile): Promise<CustomArrayDict<Reference>> {
    await this.processPendingActions();
    return this.getBacklinksForFile(pathOrFile);
  }

  private handleFileDelete(file: TAbstractFile): void {
    this.setPendingAction(file.path, Action.Remove);
  }

  private handleFileRename(file: TAbstractFile, oldPath: string): void {
    this.setPendingAction(oldPath, Action.Remove);
    this.setPendingAction(file.path, Action.Refresh);
  }

  private handleMetadataChanged(file: TFile): void {
    this.setPendingAction(file.path, Action.Refresh);
  }

  private async processAllNotes(): Promise<void> {
    await loop({
      abortSignal: this.abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Processing backlinks ${iterationStr} - ${note.path}`,
      items: getMarkdownFilesSorted(this.app),
      processItem: async (note) => {
        await this.refreshBacklinks(note.path);
      },
      shouldContinueOnError: true
    });
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

    const noteFile = getFileOrNull(this.app, notePath);

    if (!noteFile) {
      return;
    }

    if (isCanvasFile(this.app, noteFile) && !isCanvasPluginEnabled(this.app)) {
      return;
    }

    if (!this.linksMap.has(notePath)) {
      this.linksMap.set(notePath, new Set<string>());
    }

    const cache = await getCacheSafe(this.app, noteFile);

    if (!cache) {
      return;
    }

    for (const link of getAllLinks(cache)) {
      const linkFile = extractLinkFile(this.app, link, notePath);
      if (!linkFile) {
        continue;
      }

      let notePathLinksMap = this.backlinksMap.get(linkFile.path);

      if (!notePathLinksMap) {
        notePathLinksMap = new Map<string, Set<Reference>>();
        this.backlinksMap.set(linkFile.path, notePathLinksMap);
      }

      let linkSet = notePathLinksMap.get(notePath);

      if (!linkSet) {
        linkSet = new Set<Reference>();
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

  private removeLinkedPathEntries(path: string): void {
    const linkedNotePaths = this.linksMap.get(path) ?? [];

    for (const linkedNotePath of linkedNotePaths) {
      this.backlinksMap.get(linkedNotePath)?.delete(path);
    }

    this.linksMap.delete(path);
  }

  private removePathEntries(path: string): void {
    console.debug(`Removing ${path} entries`);
    this.backlinksMap.delete(path);
    this.removeLinkedPathEntries(path);
  }

  private setPendingAction(path: string, action: Action): void {
    this.pendingActions.set(path, action);
    this.debouncedProcessPendingActions();
  }
}
