import type {
  Debouncer,
  MetadataCache,
  Reference
} from 'obsidian';
import type { PathOrFile } from 'obsidian-dev-utils/obsidian/FileSystem';
import type { GetBacklinksForFileSafeWrapper } from 'obsidian-dev-utils/obsidian/MetadataCache';
import type { CustomArrayDict } from 'obsidian-typings';

import {
  debounce,
  MarkdownView,
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
import { registerPatch } from 'obsidian-dev-utils/obsidian/MonkeyAround';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { sortReferences } from 'obsidian-dev-utils/obsidian/Reference';
import { getMarkdownFilesSorted } from 'obsidian-dev-utils/obsidian/Vault';
import {
  CustomArrayDictImpl,
  ViewType
} from 'obsidian-typings/implementations';

import type { PluginTypes } from './PluginTypes.ts';

import {
  patchBacklinksCorePlugin,
  reloadBacklinksView
} from './BacklinkCorePlugin.ts';
import {
  initCanvasHandlers,
  isCanvasPluginEnabled
} from './Canvas.ts';
import { PluginSettingsManager } from './PluginSettingsManager.ts';
import { PluginSettingsTab } from './PluginSettingsTab.ts';

const INTERVAL_IN_MILLISECONDS = 500;

enum Action {
  Refresh,
  Remove
}

type GetBacklinksForFileFn = MetadataCache['getBacklinksForFile'];

export class Plugin extends PluginBase<PluginTypes> {
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

  protected override createSettingsManager(): PluginSettingsManager {
    return new PluginSettingsManager(this);
  }

  protected override createSettingsTab(): null | PluginSettingsTab {
    return new PluginSettingsTab(this);
  }

  protected override async onLayoutReady(): Promise<void> {
    registerPatch(this, this.app.metadataCache, {
      getBacklinksForFile: (next: GetBacklinksForFileFn): GetBacklinksForFileFn & GetBacklinksForFileSafeWrapper =>
        Object.assign(this.getBacklinksForFile.bind(this), {
          originalFn: next,
          safe: this.getBacklinksForFileSafe.bind(this)
        }) as unknown as GetBacklinksForFileFn & GetBacklinksForFileSafeWrapper
    });

    this.debouncedProcessPendingActions = debounce(this.processPendingActions.bind(this), INTERVAL_IN_MILLISECONDS, true);
    patchBacklinksCorePlugin(this);
    initCanvasHandlers(this);
    await this.processAllNotes();
    this.registerEvent(this.app.vault.on('rename', this.handleFileRename.bind(this)));
    this.registerEvent(this.app.vault.on('delete', this.handleFileDelete.bind(this)));
    this.registerEvent(this.app.vault.on('create', this.handleFileCreate.bind(this)));
    this.registerEvent(this.app.vault.on('modify', this.handleFileModify.bind(this)));
    this.registerEvent(this.app.metadataCache.on('changed', this.handleMetadataChanged.bind(this)));
  }

  private getBacklinksForFile(pathOrFile: PathOrFile): CustomArrayDict<Reference> {
    const notePathLinksMap = this.backlinksMap.get(getPath(this.app, pathOrFile)) ?? new Map<string, Set<Reference>>();
    const dict = new CustomArrayDictImpl<Reference>();

    for (const [notePath, links] of notePathLinksMap.entries()) {
      this.abortSignal.throwIfAborted();
      for (const link of sortReferences(Array.from(links))) {
        this.abortSignal.throwIfAborted();
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

  private handleFileCreate(file: TAbstractFile): void {
    if (file instanceof TFile) {
      this.setPendingAction(file.path, Action.Refresh);
    }
  }

  private handleFileDelete(file: TAbstractFile): void {
    this.setPendingAction(file.path, Action.Remove);
  }

  private handleFileModify(file: TAbstractFile): void {
    if (file instanceof TFile) {
      this.setPendingAction(file.path, Action.Refresh);
    }
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
      progressBarTitle: 'Backlink Cache: Initializing...',
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });
  }

  private async processPendingActions(): Promise<void> {
    const pathActions = Array.from(this.pendingActions.entries());
    this.pendingActions.clear();

    for (const [path, action] of pathActions) {
      if (this.abortSignal.aborted) {
        return;
      }

      switch (action) {
        case Action.Refresh:
          await this.refreshBacklinks(path);
          break;
        case Action.Remove:
          this.removeBacklinks(path);
          break;
        default:
          throw new Error('Unknown action');
      }
    }

    if (pathActions.length > 0) {
      await this.refreshBacklinkPanels();
    }
  }

  private async refreshBacklinkPanels(): Promise<void> {
    if (!this.settings.shouldAutomaticallyRefreshBacklinkPanels) {
      return;
    }

    await reloadBacklinksView(this.app);

    for (const leaf of this.app.workspace.getLeavesOfType(ViewType.Markdown)) {
      if (this.abortSignal.aborted) {
        return;
      }

      if (!(leaf.view instanceof MarkdownView)) {
        continue;
      }

      if (!leaf.view.backlinks) {
        continue;
      }

      leaf.view.backlinks.recomputeBacklink(leaf.view.backlinks.file);
    }
  }

  private async refreshBacklinks(notePath: string): Promise<void> {
    this.consoleDebug(`Refreshing backlinks for ${notePath}`);
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
      if (this.abortSignal.aborted) {
        return;
      }
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
    this.consoleDebug(`Removing backlinks for ${path}`);
    this.removePathEntries(path);
  }

  private removeLinkedPathEntries(path: string): void {
    const linkedNotePaths = this.linksMap.get(path) ?? [];

    for (const linkedNotePath of linkedNotePaths) {
      if (this.abortSignal.aborted) {
        return;
      }
      this.backlinksMap.get(linkedNotePath)?.delete(path);
    }

    this.linksMap.delete(path);
  }

  private removePathEntries(path: string): void {
    this.consoleDebug(`Removing ${path} entries`);
    this.backlinksMap.delete(path);
    this.removeLinkedPathEntries(path);
  }

  private setPendingAction(path: string, action: Action): void {
    this.pendingActions.set(path, action);
    this.debouncedProcessPendingActions();
  }
}
