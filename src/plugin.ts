import type {
  App,
  Debouncer,
  MetadataCache,
  PluginManifest,
  Reference
} from 'obsidian';
import type { PathOrFile } from 'obsidian-dev-utils/obsidian/file-system';
import type { GetBacklinksForFileSafeWrapper } from 'obsidian-dev-utils/obsidian/metadata-cache';
import type { CustomArrayDict } from 'obsidian-typings';

import {
  debounce,
  MarkdownView,
  TAbstractFile,
  TFile
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { CommandHandlerComponent } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler-component';
import {
  getFileOrNull,
  getPath,
  isCanvasFile
} from 'obsidian-dev-utils/obsidian/file-system';
import { extractLinkFile } from 'obsidian-dev-utils/obsidian/link';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import {
  getAllLinks,
  getCacheSafe
} from 'obsidian-dev-utils/obsidian/metadata-cache';
import { registerPatch } from 'obsidian-dev-utils/obsidian/monkey-around';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/plugin/components/plugin-settings-tab-component';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';
import { sortReferences } from 'obsidian-dev-utils/obsidian/reference';
import { getMarkdownFilesSorted } from 'obsidian-dev-utils/obsidian/vault';
import {
  CustomArrayDictImpl,
  ViewType
} from 'obsidian-typings/implementations';

import type { PluginSettings } from './plugin-settings.ts';

import {
  patchBacklinksCorePlugin,
  reloadBacklinksView
} from './backlink-core-plugin.ts';
import {
  initCanvasHandlers,
  isCanvasPluginEnabled
} from './canvas.ts';
import { RefreshBacklinkPanelsCommandHandler } from './command-handlers/refresh-backlink-panels-command-handler.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';

const INTERVAL_IN_MILLISECONDS = 500;

enum Action {
  Refresh,
  Remove
}

type GetBacklinksForFileFn = MetadataCache['getBacklinksForFile'];

export class Plugin extends PluginBase {
  private readonly backlinksMap = new Map<string, Map<string, Set<Reference>>>();
  private debouncedProcessPendingActions?: Debouncer<[], Promise<void>>;
  private readonly linksMap = new Map<string, Set<string>>();
  private readonly pendingActions = new Map<string, Action>();
  private readonly pluginSettingsComponent: PluginSettingsComponent;


  public constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
    this.pluginSettingsComponent = this.registerComponent({
      component: new PluginSettingsComponent({
        loadData: this.loadData.bind(this),
        saveData: this.saveData.bind(this)
      }),
      shouldPreload: true
    });

    const pluginSettingsTab = new PluginSettingsTab({
      plugin: this,
      pluginSettingsComponent: this.pluginSettingsComponent
    });
    this.registerComponent({
      component: new PluginSettingsTabComponent(this, pluginSettingsTab)
    });
    this.registerComponent({
      component: new CommandHandlerComponent(
        this,
        new RefreshBacklinkPanelsCommandHandler({
          pluginName: manifest.name,
          refreshBacklinkPanels: this.refreshBacklinkPanels.bind(this)
        })
      )
    });
  }

  public getAbortSignal(): AbortSignal {
    return this.abortSignalComponent.abortSignal;
  }

  public getPluginSettings(): PluginSettings {
    return this.pluginSettingsComponent.settings;
  }

  public async refreshBacklinkPanels(): Promise<void> {
    await reloadBacklinksView(this.app);

    for (const leaf of this.app.workspace.getLeavesOfType(ViewType.Markdown)) {
      if (this.abortSignalComponent.abortSignal.aborted) {
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

  public triggerRefresh(path: string): void {
    this.setPendingAction(path, Action.Refresh);
  }

  public triggerRemove(path: string): void {
    this.setPendingAction(path, Action.Remove);
  }

  protected override async onLayoutReady(): Promise<void> {
    registerPatch(this, this.app.metadataCache, {
      getBacklinksForFile: (next: GetBacklinksForFileFn): GetBacklinksForFileFn & GetBacklinksForFileSafeWrapper => {
        const patched: GetBacklinksForFileFn & GetBacklinksForFileSafeWrapper = Object.assign(this.getBacklinksForFile.bind(this), {
          originalFn: next,
          safe: this.getBacklinksForFileSafe.bind(this)
        });
        return patched;
      }
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
      this.abortSignalComponent.abortSignal.throwIfAborted();
      for (const link of sortReferences(Array.from(links))) {
        this.abortSignalComponent.abortSignal.throwIfAborted();
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
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Processing backlinks ${iterationStr} - ${note.path}`,
      items: getMarkdownFilesSorted(this.app),
      processItem: async (note) => {
        await this.refreshBacklinks(note.path);
      },
      progressBarTitle: 'Backlink Cache: Initializing...',
      shouldContinueOnError: true,
      shouldShowNotice: this.pluginSettingsComponent.settings.shouldShowProgressBarOnLoad
    });
  }

  private async processPendingActions(): Promise<void> {
    const pathActions = Array.from(this.pendingActions.entries());
    this.pendingActions.clear();

    for (const [path, action] of pathActions) {
      if (this.abortSignalComponent.abortSignal.aborted) {
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

    if (pathActions.length > 0 && this.pluginSettingsComponent.settings.shouldAutomaticallyRefreshBacklinkPanels) {
      await this.refreshBacklinkPanels();
    }
  }

  private async refreshBacklinks(notePath: string): Promise<void> {
    this.consoleDebugComponent.debug(`Refreshing backlinks for ${notePath}`);
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
      if (this.abortSignalComponent.abortSignal.aborted) {
        return;
      }
      const linkFile = extractLinkFile(this.app, link, notePath, true);
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
    this.consoleDebugComponent.debug(`Removing backlinks for ${path}`);
    this.removePathEntries(path);
  }

  private removeLinkedPathEntries(path: string): void {
    const linkedNotePaths = this.linksMap.get(path) ?? [];

    for (const linkedNotePath of linkedNotePaths) {
      if (this.abortSignalComponent.abortSignal.aborted) {
        return;
      }
      this.backlinksMap.get(linkedNotePath)?.delete(path);
    }

    this.linksMap.delete(path);
  }

  private removePathEntries(path: string): void {
    this.consoleDebugComponent.debug(`Removing ${path} entries`);
    this.backlinksMap.delete(path);
    this.removeLinkedPathEntries(path);
  }

  private setPendingAction(path: string, action: Action): void {
    this.pendingActions.set(path, action);
    this.debouncedProcessPendingActions?.();
  }
}
