import { around } from 'monkey-around';
import type {
  Debouncer,
  Reference
} from 'obsidian';
import {
  debounce,
  Notice,
  PluginSettingTab,
  TAbstractFile,
  TFile
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import type { PathOrFile } from 'obsidian-dev-utils/obsidian/FileSystem';
import {
  getFileOrNull,
  getPath
} from 'obsidian-dev-utils/obsidian/FileSystem';
import { extractLinkFile } from 'obsidian-dev-utils/obsidian/Link';
import type { GetBacklinksForFileSafeWrapper } from 'obsidian-dev-utils/obsidian/MetadataCache';
import {
  getAllLinks,
  getCacheSafe
} from 'obsidian-dev-utils/obsidian/MetadataCache';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { sortReferences } from 'obsidian-dev-utils/obsidian/Reference';
import { getMarkdownFilesSorted } from 'obsidian-dev-utils/obsidian/Vault';
import type { CustomArrayDict } from 'obsidian-typings';
import { CustomArrayDictImpl } from 'obsidian-typings/implementations';

const INTERVAL_IN_MILLISECONDS = 500;

enum Action {
  Refresh,
  Remove
}

type GetBacklinksForFileFn = (file: TFile) => CustomArrayDict<Reference>;

export default class BacklinkCachePlugin extends PluginBase<object> {
  private readonly linksMap = new Map<string, Set<string>>();
  private readonly backlinksMap = new Map<string, Map<string, Set<Reference>>>();
  private readonly pendingActions = new Map<string, Action>();
  private debouncedProcessPendingActions!: Debouncer<[], Promise<void>>;

  protected override createDefaultPluginSettings(): object {
    return {};
  }

  protected override createPluginSettingsTab(): PluginSettingTab | null {
    return null;
  }

  protected override async onLayoutReady(): Promise<void> {
    this.register(around(this.app.metadataCache, {
      getBacklinksForFile: (originalFn: GetBacklinksForFileFn): GetBacklinksForFileFn & GetBacklinksForFileSafeWrapper =>
        Object.assign(this.getBacklinksForFile.bind(this), {
          originalFn,
          safe: this.getBacklinksForFileSafe.bind(this)
        })
    }));

    this.registerEvent(this.app.metadataCache.on('changed', this.handleMetadataChanged.bind(this)));
    this.registerEvent(this.app.vault.on('rename', this.handleFileRename.bind(this)));
    this.registerEvent(this.app.vault.on('delete', this.handleFileDelete.bind(this)));
    this.debouncedProcessPendingActions = debounce(this.processPendingActions.bind(this), INTERVAL_IN_MILLISECONDS, true);

    await this.processAllNotes();
  }

  private async processAllNotes(): Promise<void> {
    const noteFiles = getMarkdownFilesSorted(this.app);

    const notice = new Notice('', 0);
    let i = 0;
    for (const noteFile of noteFiles) {
      if (this.abortSignal.aborted) {
        break;
      }
      i++;
      const message = `Processing backlinks # ${i.toString()} / ${noteFiles.length.toString()} - ${noteFile.path}`;
      console.debug(message);
      notice.setMessage(message);
      await this.refreshBacklinks(noteFile.path);
    }
    notice.hide();
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

  private setPendingAction(path: string, action: Action): void {
    this.pendingActions.set(path, action);
    this.debouncedProcessPendingActions();
  }

  private handleMetadataChanged(file: TFile): void {
    this.setPendingAction(file.path, Action.Refresh);
  }

  private handleFileRename(file: TAbstractFile, oldPath: string): void {
    this.setPendingAction(oldPath, Action.Remove);
    this.setPendingAction(file.path, Action.Refresh);
  }

  private handleFileDelete(file: TAbstractFile): void {
    this.setPendingAction(file.path, Action.Remove);
  }

  private removePathEntries(path: string): void {
    console.debug(`Removing ${path} entries`);
    this.backlinksMap.delete(path);
    this.removeLinkedPathEntries(path);
  }

  private removeLinkedPathEntries(path: string): void {
    const linkedNotePaths = this.linksMap.get(path) ?? [];

    for (const linkedNotePath of linkedNotePaths) {
      this.backlinksMap.get(linkedNotePath)?.delete(path);
    }

    this.linksMap.delete(path);
  }

  private getBacklinksForFile(pathOrFile: PathOrFile): CustomArrayDict<Reference> {
    const notePathLinksMap = this.backlinksMap.get(getPath(pathOrFile)) ?? new Map<string, Set<Reference>>();
    const dict = new CustomArrayDictImpl<Reference>();

    for (const [notePath, links] of notePathLinksMap.entries()) {
      for (const link of sortReferences(Array.from(links))) {
        dict.add(notePath, link);
      }
    }

    window.setImmediate(() => {
      invokeAsyncSafely(this.processPendingActions.bind(this));
    });
    return dict;
  }

  private async getBacklinksForFileSafe(pathOrFile: PathOrFile): Promise<CustomArrayDict<Reference>> {
    await this.processPendingActions();
    return this.getBacklinksForFile(pathOrFile);
  }
}
