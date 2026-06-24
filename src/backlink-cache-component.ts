import type { CustomArrayDict } from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  Debouncer,
  Reference
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { ConsoleDebugComponent } from 'obsidian-dev-utils/obsidian/components/console-debug-component';
import type { PathOrFile } from 'obsidian-dev-utils/obsidian/file-system';

import {
  CustomArrayDictImpl,
  ViewType
} from '@obsidian-typings/obsidian-public-latest/implementations';
import {
  debounce,
  MarkdownView,
  TAbstractFile,
  TFile
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { LayoutReadyComponent } from 'obsidian-dev-utils/obsidian/components/layout-ready-component';
import {
  getFileOrNull,
  getPath,
  isCanvasFile
} from 'obsidian-dev-utils/obsidian/file-system';
import {
  extractLinkFile,
  splitSubpath
} from 'obsidian-dev-utils/obsidian/link';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import {
  getAllLinks,
  getCacheSafe
} from 'obsidian-dev-utils/obsidian/metadata-cache';
import { sortReferences } from 'obsidian-dev-utils/obsidian/reference';
import { getMarkdownFilesSorted } from 'obsidian-dev-utils/obsidian/vault';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import {
  BacklinksCorePluginComponent,
  reloadBacklinksView
} from './backlink-core-plugin.ts';
import {
  CanvasComponent,
  isCanvasPluginEnabled
} from './canvas.ts';
import { MetadataCacheGetBacklinksForFilePatchComponent } from './patches/metadata-cache-get-backlinks-for-file-patch-component.ts';
import { MetadataCacheUpdateRelatedLinksPatchComponent } from './patches/metadata-cache-update-related-links-patch-component.ts';

interface BacklinkCacheComponentConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly app: App;
  readonly consoleDebugComponent: ConsoleDebugComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

const INTERVAL_IN_MILLISECONDS = 500;
const MARKDOWN_EXTENSION = '.md';

enum Action {
  Refresh,
  Remove
}

export class BacklinkCacheComponent extends LayoutReadyComponent {
  private readonly abortSignalComponent: AbortSignalComponent;
  private readonly backlinksMap = new Map<string, Map<string, Set<Reference>>>();
  private readonly consoleDebugComponent: ConsoleDebugComponent;

  private debouncedProcessPendingActions?: Debouncer<[], Promise<void>>;
  private readonly linksMap = new Map<string, Set<string>>();
  private readonly pendingActions = new Map<string, Action>();
  private readonly pluginSettingsComponent: PluginSettingsComponent;
  private readonly resolvedBasenameMap = new Map<string, Set<string>>();
  private readonly unresolvedBasenameMap = new Map<string, Set<string>>();
  private readonly unresolvedLinksMap = new Map<string, Set<string>>();

  public constructor(params: BacklinkCacheComponentConstructorParams) {
    super(params.app);

    this.abortSignalComponent = params.abortSignalComponent;
    this.consoleDebugComponent = params.consoleDebugComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public getBacklinksForFile(pathOrFile: PathOrFile): CustomArrayDict<Reference> {
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

  public async getBacklinksForFileSafe(pathOrFile: PathOrFile): Promise<CustomArrayDict<Reference>> {
    await this.processPendingActions();
    return this.getBacklinksForFile(pathOrFile);
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

  public updateRelatedLinks(fileNames: string[]): void {
    for (const sourcePath of this.getSourcePathsToReResolve(fileNames)) {
      const sourceFile = this.app.vault.getFileByPath(sourcePath);
      if (sourceFile) {
        this.app.metadataCache.queueFileForLinkResolution(sourceFile);
      }
    }
  }

  protected override async onLayoutReady(): Promise<void> {
    this.addChild(
      new MetadataCacheGetBacklinksForFilePatchComponent({
        backlinkCacheComponent: this,
        metadataCache: this.app.metadataCache
      })
    );
    this.addChild(
      new MetadataCacheUpdateRelatedLinksPatchComponent({
        backlinkCacheComponent: this,
        metadataCache: this.app.metadataCache
      })
    );

    this.debouncedProcessPendingActions = debounce(this.processPendingActions.bind(this), INTERVAL_IN_MILLISECONDS, true);

    this.addChild(new BacklinksCorePluginComponent(this.app));
    this.addChild(
      new CanvasComponent({
        abortSignalComponent: this.abortSignalComponent,
        app: this.app,
        backlinkCacheComponent: this,
        pluginSettingsComponent: this.pluginSettingsComponent
      })
    );
    await this.processAllNotes();
    this.registerEvent(this.app.vault.on('rename', this.handleFileRename.bind(this)));
    this.registerEvent(this.app.vault.on('delete', this.handleFileDelete.bind(this)));
    this.registerEvent(this.app.vault.on('create', this.handleFileCreate.bind(this)));
    this.registerEvent(this.app.vault.on('modify', this.handleFileModify.bind(this)));
    this.registerEvent(this.app.metadataCache.on('changed', this.handleMetadataChanged.bind(this)));
  }

  private addBacklink(targetPath: string, sourcePath: string, link: Reference): void {
    let notePathLinksMap = this.backlinksMap.get(targetPath);

    if (!notePathLinksMap) {
      notePathLinksMap = new Map<string, Set<Reference>>();
      this.backlinksMap.set(targetPath, notePathLinksMap);
    }

    let linkSet = notePathLinksMap.get(sourcePath);

    if (!linkSet) {
      linkSet = new Set<Reference>();
      notePathLinksMap.set(sourcePath, linkSet);
    }

    linkSet.add(link);
    this.linksMap.get(sourcePath)?.add(targetPath);
  }

  private getSourcePathsToReResolve(fileNames: string[]): Set<string> {
    const sourcePaths = new Set<string>();
    const loweredFileNames = fileNames.map((fileName) => fileName.toLowerCase());

    for (const loweredFileName of loweredFileNames) {
      addAllToSet(sourcePaths, this.resolvedBasenameMap.get(loweredFileName));
    }

    for (const loweredFileName of loweredFileNames) {
      addAllToSet(sourcePaths, this.unresolvedBasenameMap.get(loweredFileName));
      if (loweredFileName.endsWith(MARKDOWN_EXTENSION)) {
        addAllToSet(sourcePaths, this.unresolvedBasenameMap.get(loweredFileName.slice(0, -MARKDOWN_EXTENSION.length)));
      }
    }

    return sourcePaths;
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
    this.consoleDebugComponent.consoleDebug(`Refreshing backlinks for ${notePath}`);
    this.removeLinkedPathEntries(notePath);

    const noteFile = getFileOrNull(this.app, notePath);

    if (!noteFile) {
      return;
    }

    if (isCanvasFile(noteFile) && !isCanvasPluginEnabled(this.app)) {
      return;
    }

    /* v8 ignore start -- removeLinkedPathEntries always deletes notePath from linksMap before this point. */
    if (!this.linksMap.has(notePath)) {
      /* v8 ignore stop */
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

      const resolvedLinkFile = extractLinkFile(this.app, link, notePath);
      if (resolvedLinkFile) {
        this.addBacklink(resolvedLinkFile.path, notePath, link);
        addToMapSet(this.resolvedBasenameMap, getBasenameLower(resolvedLinkFile.path), notePath);
        continue;
      }

      const nonExistingLinkFile = extractLinkFile(this.app, link, notePath, true);
      if (nonExistingLinkFile) {
        this.addBacklink(nonExistingLinkFile.path, notePath, link);
      }

      const { linkPath } = splitSubpath(link.link);
      const unresolvedBasename = getBasenameLower(linkPath);
      addToMapSet(this.unresolvedBasenameMap, unresolvedBasename, notePath);
      addToMapSet(this.unresolvedLinksMap, notePath, unresolvedBasename);
    }
  }

  private removeBacklinks(path: string): void {
    this.consoleDebugComponent.consoleDebug(`Removing backlinks for ${path}`);
    this.removePathEntries(path);
  }

  private removeLinkedPathEntries(path: string): void {
    const linkedNotePaths = this.linksMap.get(path) ?? [];

    for (const linkedNotePath of linkedNotePaths) {
      if (this.abortSignalComponent.abortSignal.aborted) {
        return;
      }
      this.backlinksMap.get(linkedNotePath)?.delete(path);
      this.resolvedBasenameMap.get(getBasenameLower(linkedNotePath))?.delete(path);
    }

    this.linksMap.delete(path);

    const unresolvedBasenames = this.unresolvedLinksMap.get(path) ?? [];

    for (const unresolvedBasename of unresolvedBasenames) {
      if (this.abortSignalComponent.abortSignal.aborted) {
        return;
      }
      this.unresolvedBasenameMap.get(unresolvedBasename)?.delete(path);
    }

    this.unresolvedLinksMap.delete(path);
  }

  private removePathEntries(path: string): void {
    this.consoleDebugComponent.consoleDebug(`Removing ${path} entries`);
    this.backlinksMap.delete(path);
    this.removeLinkedPathEntries(path);
  }

  private setPendingAction(path: string, action: Action): void {
    this.pendingActions.set(path, action);
    this.debouncedProcessPendingActions?.();
  }
}

function addAllToSet(target: Set<string>, source: Set<string> | undefined): void {
  if (!source) {
    return;
  }

  for (const value of source) {
    target.add(value);
  }
}

function addToMapSet(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key);

  if (!set) {
    set = new Set<string>();
    map.set(key, set);
  }

  set.add(value);
}

function getBasenameLower(path: string): string {
  const slashIndex = path.lastIndexOf('/');
  const basename = slashIndex === -1 ? path : path.slice(slashIndex + 1);
  return basename.toLowerCase();
}
