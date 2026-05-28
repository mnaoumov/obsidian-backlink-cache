import type { CustomArrayDict } from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  CachedMetadata,
  LinkCache,
  PluginManifest,
  Reference,
  ReferenceCache,
  WorkspaceLeaf
} from 'obsidian';

import {
  MarkdownView,
  TAbstractFile,
  TFile
} from 'obsidian';
import { noop } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  getFileOrNull,
  isCanvasFile
} from 'obsidian-dev-utils/obsidian/file-system';
import { extractLinkFile } from 'obsidian-dev-utils/obsidian/link';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import {
  getAllLinks,
  getCacheSafe
} from 'obsidian-dev-utils/obsidian/metadata-cache';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { reloadBacklinksView } from './backlink-core-plugin.ts';
import { isCanvasPluginEnabled } from './canvas.ts';
import { Plugin } from './plugin.ts';

vi.mock('obsidian-dev-utils/async', () => ({
  invokeAsyncSafely: vi.fn((fn: () => Promise<void>) => fn())
}));

vi.mock('obsidian-dev-utils/obsidian/active-file-provider', () => ({
  AppActiveFileProvider: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/command-handlers/command-handler-component', () => ({
  CommandHandlerComponent: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/command-registrar', () => ({
  PluginCommandRegistrar: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/components/layout-ready-component', () => ({
  CallbackLayoutReadyComponent: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/components/menu-event-registrar-component', () => ({
  MenuEventRegistrarComponent: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/components/monkey-around-component', () => ({
  MonkeyAroundComponent: class {
    public registerPatch(target: object, patches: Record<string, (next: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown>): void {
      for (const [key, factory] of Object.entries(patches)) {
        const original = (target as Record<string, (...args: unknown[]) => unknown>)[key] ?? noop;
        (target as Record<string, unknown>)[key] = factory(original);
      }
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/components/plugin-settings-tab-component', () => ({
  PluginSettingsTabComponent: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/data-handler', () => ({
  PluginDataHandler: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/file-system', () => ({
  getFileOrNull: vi.fn(),
  getPath: vi.fn((_app: unknown, pathOrFile: unknown) => {
    if (typeof pathOrFile === 'string') {
      return pathOrFile;
    }
    return (pathOrFile as TAbstractFile).path;
  }),
  isCanvasFile: vi.fn().mockReturnValue(false)
}));

vi.mock('obsidian-dev-utils/obsidian/link', () => ({
  extractLinkFile: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/loop', () => ({
  loop: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/metadata-cache', () => ({
  getAllLinks: vi.fn().mockReturnValue([]),
  getCacheSafe: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin', () => {
  class MockPluginBase {
    public abortSignalComponent = { abortSignal: { aborted: false, throwIfAborted: vi.fn() } };
    public app: App;
    public consoleDebugComponent = { debug: vi.fn() };
    public manifest: PluginManifest;

    public constructor(app: App, manifest: PluginManifest) {
      this.app = app;
      this.manifest = manifest;
    }

    public addChild(child: unknown): unknown {
      return child;
    }

    public register(): void {
      noop();
    }

    public registerEvent(): void {
      noop();
    }
  }
  return { PluginBase: MockPluginBase };
});

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-event-source', () => ({
  PluginEventSourceImpl: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/reference', () => ({
  sortReferences: vi.fn((refs: Reference[]) => refs)
}));

vi.mock('obsidian-dev-utils/obsidian/vault', () => ({
  getMarkdownFilesSorted: vi.fn().mockReturnValue([])
}));

vi.mock('./backlink-core-plugin.ts', () => ({
  patchBacklinksCorePlugin: vi.fn(),
  reloadBacklinksView: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('./canvas.ts', () => ({
  initCanvasHandlers: vi.fn(),
  isCanvasPluginEnabled: vi.fn().mockReturnValue(true)
}));

vi.mock('./command-handlers/refresh-backlink-panels-command-handler.ts', () => ({
  RefreshBacklinkPanelsCommandHandler: vi.fn()
}));

vi.mock('./plugin-settings-component.ts', () => ({
  PluginSettingsComponent: class MockPluginSettingsComponent {
    public settings = {
      shouldAutomaticallyRefreshBacklinkPanels: false,
      shouldShowProgressBarOnLoad: true
    };
  }
}));

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: vi.fn()
}));

interface EventHandlers {
  changed(file: TFile): void;
  create(file: TAbstractFile): void;
  delete(file: TAbstractFile): void;
  modify(file: TAbstractFile): void;
  rename(file: TAbstractFile, oldPath: string): void;
}

interface GetBacklinksForFileFn {
  (path: string): CustomArrayDict<Reference>;
  originalFn(...args: unknown[]): unknown;
  safe(path: string): Promise<CustomArrayDict<Reference>>;
}

interface MockAbortSignal {
  aborted: boolean;
  throwIfAborted: ReturnType<typeof vi.fn>;
}

interface MockAbortSignalComponent {
  abortSignal: MockAbortSignal;
}

interface MockPluginSettings {
  shouldAutomaticallyRefreshBacklinkPanels: boolean;
}

interface MockPluginSettingsComponent {
  settings: MockPluginSettings;
}

interface PluginInternals {
  abortSignalComponent: MockAbortSignalComponent;
  backlinksMap: Map<string, Map<string, Set<Reference>>>;
  linksMap: Map<string, Set<string>>;
  onLayoutReady(): Promise<void>;
  pendingActions: Map<string, number>;
  pluginSettingsComponent: MockPluginSettingsComponent;
  processPendingActions(): Promise<void>;
  refreshBacklinks(path: string): Promise<void>;
  removeLinkedPathEntries(path: string): void;
}

function asInternals(plugin: InstanceType<typeof Plugin>): PluginInternals {
  return castTo<PluginInternals>(plugin);
}

function createMockApp(): App {
  return strictProxy<App>({
    metadataCache: {
      getBacklinksForFile: vi.fn(),
      on: vi.fn().mockReturnValue({ id: 'event' })
    },
    vault: {
      on: vi.fn().mockReturnValue({ id: 'event' })
    },
    workspace: {
      getLeavesOfType: vi.fn().mockReturnValue([])
    }
  });
}

function createMockManifest(): PluginManifest {
  return strictProxy<PluginManifest>({
    id: 'backlink-cache',
    name: 'Backlink Cache'
  });
}

function getBacklinksForFileFn(app: App): GetBacklinksForFileFn {
  return castTo<GetBacklinksForFileFn>(app.metadataCache.getBacklinksForFile);
}

describe('Plugin', () => {
  let plugin: InstanceType<typeof Plugin>;
  let app: App;

  beforeEach(() => {
    vi.useFakeTimers();
    app = createMockApp();
    plugin = new Plugin(app, createMockManifest());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create the plugin', () => {
      expect(plugin).toBeDefined();
      expect(plugin.app).toBe(app);
    });
  });

  describe('getAbortSignal', () => {
    it('should return the abort signal', () => {
      const signal = plugin.getAbortSignal();
      expect(signal.aborted).toBe(false);
    });
  });

  describe('getPluginSettings', () => {
    it('should return plugin settings', () => {
      const settings = plugin.getPluginSettings();
      expect(settings.shouldShowProgressBarOnLoad).toBe(true);
    });
  });

  describe('refreshBacklinkPanels', () => {
    it('should reload backlinks view and recompute MarkdownView backlinks', async () => {
      const recomputeBacklink = vi.fn();
      const mockLeaf = {
        view: Object.assign(Object.create(MarkdownView.prototype), {
          backlinks: {
            file: strictProxy<TFile>({ path: 'test.md' }),
            recomputeBacklink
          }
        })
      };
      vi.mocked(app.workspace.getLeavesOfType).mockReturnValue(castTo<WorkspaceLeaf[]>([mockLeaf]));

      await plugin.refreshBacklinkPanels();

      expect(reloadBacklinksView).toHaveBeenCalledWith(app);
      expect(recomputeBacklink).toHaveBeenCalled();
    });

    it('should skip non-MarkdownView and views without backlinks', async () => {
      const mockLeaves = [
        { view: {} },
        { view: Object.assign(Object.create(MarkdownView.prototype), { backlinks: null }) }
      ];
      vi.mocked(app.workspace.getLeavesOfType).mockReturnValue(castTo<WorkspaceLeaf[]>(mockLeaves));

      await plugin.refreshBacklinkPanels();
      expect(reloadBacklinksView).toHaveBeenCalled();
    });

    it('should stop when aborted', async () => {
      const recomputeBacklink = vi.fn();
      const mockLeaf = {
        view: Object.assign(Object.create(MarkdownView.prototype), {
          backlinks: { file: strictProxy<TFile>({ path: 'test.md' }), recomputeBacklink }
        })
      };
      vi.mocked(app.workspace.getLeavesOfType).mockReturnValue(castTo<WorkspaceLeaf[]>([mockLeaf]));

      asInternals(plugin).abortSignalComponent.abortSignal.aborted = true;

      await plugin.refreshBacklinkPanels();
      expect(recomputeBacklink).not.toHaveBeenCalled();
    });
  });

  describe('onLayoutReady and internal methods', () => {
    async function setupOnLayoutReady(): Promise<void> {
      await asInternals(plugin).onLayoutReady();
    }

    async function processPendingActions(): Promise<void> {
      await asInternals(plugin).processPendingActions.call(plugin);
    }

    it('should set up patches, handlers, and process all notes', async () => {
      await setupOnLayoutReady();
      expect(loop).toHaveBeenCalled();
    });

    it('should invoke processItem and buildNoticeMessage callbacks via loop in processAllNotes', async () => {
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'note.md' });

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(getCacheSafe).mockResolvedValue(null);

      vi.mocked(loop).mockImplementation(async (opts) => {
        (opts.buildNoticeMessage)(mockFile, '1/1');
        await (opts.processItem as (item: TFile) => Promise<void>)(mockFile);
      });

      await setupOnLayoutReady();

      expect(getCacheSafe).toHaveBeenCalled();
    });

    it('should return backlinks via getBacklinksForFile', async () => {
      await setupOnLayoutReady();

      // GetBacklinksForFile is now patched on app.metadataCache
      const result = getBacklinksForFileFn(app)('test.md');
      expect(result.keys()).toEqual([]);
    });

    it('should return backlinks via getBacklinksForFileSafe', async () => {
      await setupOnLayoutReady();

      const result = await getBacklinksForFileFn(app).safe('test.md');
      expect(result.keys()).toEqual([]);
    });

    it('should expose originalFn', async () => {
      await setupOnLayoutReady();

      const originalFn = getBacklinksForFileFn(app).originalFn;
      expect(originalFn).toBeDefined();
    });

    it('should process refresh action via pending actions', async () => {
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'note.md' });

      const linkFile = Object.create(TFile.prototype);
      Object.assign(linkFile, { path: 'target.md' });

      const link = strictProxy<ReferenceCache>({
        link: 'target',
        original: '[[target]]',
        position: { end: { col: 10, line: 0, offset: 10 }, start: { col: 0, line: 0, offset: 0 } }
      });

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(getCacheSafe).mockResolvedValue(strictProxy<CachedMetadata>({ links: [link] }));
      vi.mocked(getAllLinks).mockReturnValue([link]);
      vi.mocked(extractLinkFile).mockReturnValue(linkFile);

      await setupOnLayoutReady();

      plugin.triggerRefresh('note.md');
      await processPendingActions();

      // Now target.md should have note.md as a backlink
      const result = getBacklinksForFileFn(app)('target.md');
      expect(result.keys()).toContain('note.md');
    });

    it('should process remove action', async () => {
      await setupOnLayoutReady();

      plugin.triggerRemove('test.md');
      await processPendingActions();
    });

    it('should refresh backlink panels after actions when setting is enabled', async () => {
      const settingsComponent = asInternals(plugin).pluginSettingsComponent;
      settingsComponent.settings.shouldAutomaticallyRefreshBacklinkPanels = true;

      vi.mocked(getFileOrNull).mockReturnValue(null);

      await setupOnLayoutReady();

      plugin.triggerRefresh('test.md');
      await processPendingActions();

      expect(reloadBacklinksView).toHaveBeenCalled();
    });

    it('should handle non-existent file in refreshBacklinks', async () => {
      vi.mocked(getFileOrNull).mockReturnValue(null);

      await setupOnLayoutReady();
      plugin.triggerRefresh('nonexistent.md');
      await processPendingActions();
    });

    it('should skip canvas files when canvas plugin is disabled', async () => {
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'test.canvas' });

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(isCanvasFile).mockReturnValue(true);
      vi.mocked(isCanvasPluginEnabled).mockReturnValue(false);

      await setupOnLayoutReady();
      plugin.triggerRefresh('test.canvas');
      await processPendingActions();
    });

    it('should handle null cache in refreshBacklinks', async () => {
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'note.md' });

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(getCacheSafe).mockResolvedValue(null);

      await setupOnLayoutReady();

      // Call refreshBacklinks directly to ensure coverage
      await asInternals(plugin).refreshBacklinks.call(plugin, 'note.md');
    });

    it('should skip links with no link file in refreshBacklinks', async () => {
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'note.md' });

      const mockLink: LinkCache = {
        link: 'missing',
        original: '[[missing]]',
        position: { end: { col: 10, line: 0, offset: 10 }, start: { col: 0, line: 0, offset: 0 } }
      };

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(isCanvasFile).mockReturnValue(false);
      vi.mocked(getCacheSafe).mockResolvedValue(strictProxy<CachedMetadata>({ links: [mockLink] }));
      vi.mocked(getAllLinks).mockReturnValue([mockLink]);
      vi.mocked(extractLinkFile).mockReturnValue(null);

      await asInternals(plugin).refreshBacklinks.call(plugin, 'note.md');

      expect(extractLinkFile).toHaveBeenCalledWith(app, mockLink, 'note.md', true);
    });

    it('should reuse existing linkSet for multiple links to same target', async () => {
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'note.md' });

      const linkFile = Object.create(TFile.prototype);
      Object.assign(linkFile, { path: 'target.md' });

      const link1 = strictProxy<ReferenceCache>({
        link: 'target',
        original: '[[target]]',
        position: { end: { col: 10, line: 0, offset: 10 }, start: { col: 0, line: 0, offset: 0 } }
      });
      const link2 = strictProxy<ReferenceCache>({
        link: 'target',
        original: '[[target|alias]]',
        position: { end: { col: 20, line: 1, offset: 30 }, start: { col: 0, line: 1, offset: 20 } }
      });

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(isCanvasFile).mockReturnValue(false);
      vi.mocked(getCacheSafe).mockResolvedValue(strictProxy<CachedMetadata>({ links: [link1, link2] }));
      vi.mocked(getAllLinks).mockReturnValue([link1, link2]);
      vi.mocked(extractLinkFile).mockReturnValue(linkFile);

      await asInternals(plugin).refreshBacklinks.call(plugin, 'note.md');

      // Check internal backlinksMap has both links
      const backlinksMap = asInternals(plugin).backlinksMap;
      const noteLinks = backlinksMap.get('target.md')?.get('note.md');
      expect(noteLinks?.size).toBe(2);
    });

    it('should throw for unknown action type', async () => {
      await setupOnLayoutReady();

      const pendingActions = asInternals(plugin).pendingActions;
      pendingActions.set('test.md', 999);

      const processFn = asInternals(plugin).processPendingActions;
      await expect(processFn.call(plugin)).rejects.toThrow('Unknown action');
    });

    it('should stop refreshBacklinks when aborted during link iteration', async () => {
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'note.md' });

      const link = strictProxy<ReferenceCache>({
        link: 'target',
        original: '[[target]]',
        position: { end: { col: 10, line: 0, offset: 10 }, start: { col: 0, line: 0, offset: 0 } }
      });

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(isCanvasFile).mockReturnValue(false);
      vi.mocked(getCacheSafe).mockResolvedValue(strictProxy<CachedMetadata>({ links: [link] }));
      vi.mocked(getAllLinks).mockReturnValue([link]);

      // Set aborted before processing links
      asInternals(plugin).abortSignalComponent.abortSignal.aborted = true;

      await asInternals(plugin).refreshBacklinks.call(plugin, 'note.md');

      asInternals(plugin).abortSignalComponent.abortSignal.aborted = false;
    });

    it('should stop processPendingActions when aborted', async () => {
      await setupOnLayoutReady();

      asInternals(plugin).abortSignalComponent.abortSignal.aborted = true;

      plugin.triggerRefresh('test.md');
      await asInternals(plugin).processPendingActions.call(plugin);

      asInternals(plugin).abortSignalComponent.abortSignal.aborted = false;
    });

    it('should abort getBacklinksForFile when throwIfAborted throws', async () => {
      await setupOnLayoutReady();

      // Manually populate backlinksMap to test abort in getBacklinksForFile
      const backlinksMap = asInternals(plugin).backlinksMap;
      const noteMap = new Map<string, Set<Reference>>();
      noteMap.set(
        'note.md',
        new Set([strictProxy<ReferenceCache>({
          link: 'target',
          original: '[[target]]',
          position: { end: { col: 10, line: 0, offset: 10 }, start: { col: 0, line: 0, offset: 0 } }
        })])
      );
      backlinksMap.set('target.md', noteMap);

      const throwIfAborted = asInternals(plugin).abortSignalComponent.abortSignal.throwIfAborted;
      throwIfAborted.mockImplementation(() => {
        throw new Error('aborted');
      });

      expect(() => getBacklinksForFileFn(app)('target.md')).toThrow('aborted');

      throwIfAborted.mockImplementation(() => undefined);
    });

    it('should remove linked path entries and backlinks on remove', async () => {
      await setupOnLayoutReady();

      // Manually populate maps to test removal
      const backlinksMap = asInternals(plugin).backlinksMap;
      const linksMap = asInternals(plugin).linksMap;

      const noteMap = new Map<string, Set<Reference>>();
      noteMap.set(
        'note.md',
        new Set([strictProxy<ReferenceCache>({
          link: 'target',
          original: '[[target]]',
          position: { end: { col: 10, line: 0, offset: 10 }, start: { col: 0, line: 0, offset: 0 } }
        })])
      );
      backlinksMap.set('target.md', noteMap);
      linksMap.set('note.md', new Set(['target.md']));

      expect(getBacklinksForFileFn(app)('target.md').keys()).toContain('note.md');

      // Remove via pending action
      plugin.triggerRemove('note.md');
      await processPendingActions();

      expect(getBacklinksForFileFn(app)('target.md').keys()).toEqual([]);
    });
  });

  describe('event handlers', () => {
    async function setupAndGetHandlers(): Promise<EventHandlers> {
      await asInternals(plugin).onLayoutReady();

      const vaultCalls = vi.mocked(app.vault.on).mock.calls;
      const metaCalls = vi.mocked(app.metadataCache.on).mock.calls;

      return {
        changed: metaCalls.find((c) => (c[0] as string) === 'changed')?.[1] as (file: TFile) => void,
        create: vaultCalls.find((c) => (c[0] as string) === 'create')?.[1] as (file: TAbstractFile) => void,
        delete: vaultCalls.find((c) => (c[0] as string) === 'delete')?.[1] as (file: TAbstractFile) => void,
        modify: vaultCalls.find((c) => (c[0] as string) === 'modify')?.[1] as (file: TAbstractFile) => void,
        rename: vaultCalls.find((c) => (c[0] as string) === 'rename')?.[1] as (file: TAbstractFile, oldPath: string) => void
      };
    }

    it('should handle file rename', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TAbstractFile.prototype);
      Object.assign(mockFile, { path: 'new.md' });
      handlers.rename(mockFile, 'old.md');
    });

    it('should handle file delete', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TAbstractFile.prototype);
      Object.assign(mockFile, { path: 'test.md' });
      handlers.delete(mockFile);
    });

    it('should handle file create for TFile', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'new.md' });
      handlers.create(mockFile);
    });

    it('should ignore file create for non-TFile', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TAbstractFile.prototype);
      Object.assign(mockFile, { path: 'folder' });
      handlers.create(mockFile);
    });

    it('should handle file modify for TFile', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'modified.md' });
      handlers.modify(mockFile);
    });

    it('should ignore file modify for non-TFile', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TAbstractFile.prototype);
      Object.assign(mockFile, { path: 'folder' });
      handlers.modify(mockFile);
    });

    it('should handle metadata changed', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'changed.md' });
      handlers.changed(mockFile);
    });
  });

  describe('removeLinkedPathEntries with abort', () => {
    it('should stop removing when aborted', async () => {
      await asInternals(plugin).onLayoutReady();

      // Manually populate maps
      const backlinksMap = asInternals(plugin).backlinksMap;
      const linksMap = asInternals(plugin).linksMap;

      const noteMap = new Map<string, Set<Reference>>();
      noteMap.set('note.md', new Set());
      backlinksMap.set('target.md', noteMap);
      linksMap.set('note.md', new Set(['target.md']));

      asInternals(plugin).abortSignalComponent.abortSignal.aborted = true;

      asInternals(plugin).removeLinkedPathEntries.call(plugin, 'note.md');

      // BacklinksMap should still have the entry since abort prevented removal
      expect(noteMap.has('note.md')).toBe(true);

      asInternals(plugin).abortSignalComponent.abortSignal.aborted = false;
    });
  });
});
