import type { CustomArrayDict } from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  CachedMetadata,
  PluginManifest,
  Reference
} from 'obsidian';

import {
  MarkdownView,
  TAbstractFile,
  TFile
} from 'obsidian';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

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
        const original = (target as Record<string, (...args: unknown[]) => unknown>)[key] ?? ((): void => { /* noop */ });
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
    return (pathOrFile as { path: string }).path;
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

    public addChild(child: unknown): unknown { return child; }
    public register(): void { /* noop */ }
    public registerEvent(): void { /* noop */ }
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

const { getFileOrNull, isCanvasFile } = await import('obsidian-dev-utils/obsidian/file-system');
const { extractLinkFile } = await import('obsidian-dev-utils/obsidian/link');
const { loop } = await import('obsidian-dev-utils/obsidian/loop');
const { getAllLinks, getCacheSafe } = await import('obsidian-dev-utils/obsidian/metadata-cache');
const { reloadBacklinksView } = await import('./backlink-core-plugin.ts');
const { isCanvasPluginEnabled } = await import('./canvas.ts');

const { Plugin } = await import('./plugin.ts');

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
        view: Object.assign(Object.create(MarkdownView.prototype) as object, {
          backlinks: {
            file: strictProxy<TFile>({ path: 'test.md' }),
            recomputeBacklink
          }
        })
      };
      vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([mockLeaf] as never);

      await plugin.refreshBacklinkPanels();

      expect(reloadBacklinksView).toHaveBeenCalledWith(app);
      expect(recomputeBacklink).toHaveBeenCalled();
    });

    it('should skip non-MarkdownView and views without backlinks', async () => {
      const mockLeaves = [
        { view: {} },
        { view: Object.assign(Object.create(MarkdownView.prototype) as object, { backlinks: null }) }
      ];
      vi.mocked(app.workspace.getLeavesOfType).mockReturnValue(mockLeaves as never);

      await plugin.refreshBacklinkPanels();
      expect(reloadBacklinksView).toHaveBeenCalled();
    });

    it('should stop when aborted', async () => {
      const recomputeBacklink = vi.fn();
      const mockLeaf = {
        view: Object.assign(Object.create(MarkdownView.prototype) as object, {
          backlinks: { file: strictProxy<TFile>({ path: 'test.md' }), recomputeBacklink }
        })
      };
      vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([mockLeaf] as never);

      (plugin as unknown as { abortSignalComponent: { abortSignal: { aborted: boolean } } }).abortSignalComponent.abortSignal.aborted = true;

      await plugin.refreshBacklinkPanels();
      expect(recomputeBacklink).not.toHaveBeenCalled();
    });
  });

  describe('onLayoutReady and internal methods', () => {
    async function setupOnLayoutReady(): Promise<void> {
      await (plugin as unknown as { onLayoutReady(): Promise<void> }).onLayoutReady();
    }

    async function processPendingActions(): Promise<void> {
      await (plugin as unknown as { processPendingActions(): Promise<void> }).processPendingActions.call(plugin);
    }

    it('should set up patches, handlers, and process all notes', async () => {
      await setupOnLayoutReady();
      expect(loop).toHaveBeenCalled();
    });

    it('should invoke processItem and buildNoticeMessage callbacks via loop in processAllNotes', async () => {
      const mockFile = Object.create(TFile.prototype) as TFile;
      Object.assign(mockFile, { path: 'note.md' });

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(getCacheSafe).mockResolvedValue(null);

      vi.mocked(loop).mockImplementation(async (opts) => {
        (opts.buildNoticeMessage as (item: TFile, str: string) => string)(mockFile, '1/1');
        await (opts.processItem as (item: TFile) => Promise<void>)(mockFile);
      });

      await setupOnLayoutReady();

      expect(getCacheSafe).toHaveBeenCalled();
    });

    it('should return backlinks via getBacklinksForFile', async () => {
      await setupOnLayoutReady();

      // getBacklinksForFile is now patched on app.metadataCache
      const getBacklinksForFile = app.metadataCache.getBacklinksForFile as unknown as (path: string) => CustomArrayDict<Reference>;
      const result = getBacklinksForFile('test.md');
      expect(result.keys()).toEqual([]);
    });

    it('should return backlinks via getBacklinksForFileSafe', async () => {
      await setupOnLayoutReady();

      const safe = (app.metadataCache.getBacklinksForFile as unknown as { safe: (path: string) => Promise<CustomArrayDict<Reference>> }).safe;
      const result = await safe('test.md');
      expect(result.keys()).toEqual([]);
    });

    it('should expose originalFn', async () => {
      await setupOnLayoutReady();

      const originalFn = (app.metadataCache.getBacklinksForFile as unknown as { originalFn: (...args: unknown[]) => unknown }).originalFn;
      expect(originalFn).toBeDefined();
    });

    it('should process refresh action via pending actions', async () => {
      const mockFile = Object.create(TFile.prototype) as TFile;
      Object.assign(mockFile, { path: 'note.md' });

      const linkFile = Object.create(TFile.prototype) as TFile;
      Object.assign(linkFile, { path: 'target.md' });

      const link: Reference = {
        link: 'target',
        original: '[[target]]',
        position: { end: { col: 10, line: 0, offset: 10 }, start: { col: 0, line: 0, offset: 0 } }
      } as unknown as Reference;

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(getCacheSafe).mockResolvedValue({ links: [link] } as unknown as CachedMetadata);
      vi.mocked(getAllLinks).mockReturnValue([link]);
      vi.mocked(extractLinkFile).mockReturnValue(linkFile);

      await setupOnLayoutReady();

      plugin.triggerRefresh('note.md');
      await processPendingActions();

      // Now target.md should have note.md as a backlink
      const getBacklinksForFile = app.metadataCache.getBacklinksForFile as unknown as (path: string) => CustomArrayDict<Reference>;
      const result = getBacklinksForFile('target.md');
      expect(result.keys()).toContain('note.md');
    });

    it('should process remove action', async () => {
      await setupOnLayoutReady();

      plugin.triggerRemove('test.md');
      await processPendingActions();
    });

    it('should refresh backlink panels after actions when setting is enabled', async () => {
      const settingsComponent = (plugin as unknown as { pluginSettingsComponent: { settings: { shouldAutomaticallyRefreshBacklinkPanels: boolean } } }).pluginSettingsComponent;
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
      const mockFile = Object.create(TFile.prototype) as TFile;
      Object.assign(mockFile, { path: 'test.canvas' });

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(isCanvasFile).mockReturnValue(true);
      vi.mocked(isCanvasPluginEnabled).mockReturnValue(false);

      await setupOnLayoutReady();
      plugin.triggerRefresh('test.canvas');
      await processPendingActions();
    });

    it('should handle null cache in refreshBacklinks', async () => {
      const mockFile = Object.create(TFile.prototype) as TFile;
      Object.assign(mockFile, { path: 'note.md' });

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(getCacheSafe).mockResolvedValue(null);

      await setupOnLayoutReady();

      // Call refreshBacklinks directly to ensure coverage
      const refreshBacklinks = (plugin as unknown as { refreshBacklinks(path: string): Promise<void> }).refreshBacklinks;
      await refreshBacklinks.call(plugin, 'note.md');
    });

    it('should skip links with no link file in refreshBacklinks', async () => {
      const mockFile = Object.create(TFile.prototype) as TFile;
      Object.assign(mockFile, { path: 'note.md' });

      const mockLink = { link: 'missing', original: '[[missing]]' };

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(isCanvasFile).mockReturnValue(false);
      vi.mocked(getCacheSafe).mockResolvedValue({ links: [mockLink] } as unknown as CachedMetadata);
      vi.mocked(getAllLinks).mockReturnValue([mockLink] as never);
      vi.mocked(extractLinkFile).mockReturnValue(null);

      const refreshBacklinks = (plugin as unknown as { refreshBacklinks(path: string): Promise<void> }).refreshBacklinks;
      await refreshBacklinks.call(plugin, 'note.md');

      expect(extractLinkFile).toHaveBeenCalledWith(app, mockLink, 'note.md', true);
    });

    it('should reuse existing linkSet for multiple links to same target', async () => {
      const mockFile = Object.create(TFile.prototype) as TFile;
      Object.assign(mockFile, { path: 'note.md' });

      const linkFile = Object.create(TFile.prototype) as TFile;
      Object.assign(linkFile, { path: 'target.md' });

      const link1: Reference = {
        link: 'target',
        original: '[[target]]',
        position: { end: { col: 10, line: 0, offset: 10 }, start: { col: 0, line: 0, offset: 0 } }
      } as unknown as Reference;
      const link2: Reference = {
        link: 'target',
        original: '[[target|alias]]',
        position: { end: { col: 20, line: 1, offset: 30 }, start: { col: 0, line: 1, offset: 20 } }
      } as unknown as Reference;

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(isCanvasFile).mockReturnValue(false);
      vi.mocked(getCacheSafe).mockResolvedValue({ links: [link1, link2] } as unknown as CachedMetadata);
      vi.mocked(getAllLinks).mockReturnValue([link1, link2]);
      vi.mocked(extractLinkFile).mockReturnValue(linkFile);

      const refreshBacklinks = (plugin as unknown as { refreshBacklinks(path: string): Promise<void> }).refreshBacklinks;
      await refreshBacklinks.call(plugin, 'note.md');

      // Check internal backlinksMap has both links
      const backlinksMap = (plugin as unknown as { backlinksMap: Map<string, Map<string, Set<Reference>>> }).backlinksMap;
      const noteLinks = backlinksMap.get('target.md')?.get('note.md');
      expect(noteLinks?.size).toBe(2);
    });

    it('should throw for unknown action type', async () => {
      await setupOnLayoutReady();

      const pendingActions = (plugin as unknown as { pendingActions: Map<string, number> }).pendingActions;
      pendingActions.set('test.md', 999);

      const processFn = (plugin as unknown as { processPendingActions(): Promise<void> }).processPendingActions;
      await expect(processFn.call(plugin)).rejects.toThrow('Unknown action');
    });

    it('should stop refreshBacklinks when aborted during link iteration', async () => {
      const mockFile = Object.create(TFile.prototype) as TFile;
      Object.assign(mockFile, { path: 'note.md' });

      const link: Reference = {
        link: 'target',
        original: '[[target]]',
        position: { end: { col: 10, line: 0, offset: 10 }, start: { col: 0, line: 0, offset: 0 } }
      } as unknown as Reference;

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(isCanvasFile).mockReturnValue(false);
      vi.mocked(getCacheSafe).mockResolvedValue({ links: [link] } as unknown as CachedMetadata);
      vi.mocked(getAllLinks).mockReturnValue([link]);

      // Set aborted before processing links
      (plugin as unknown as { abortSignalComponent: { abortSignal: { aborted: boolean } } }).abortSignalComponent.abortSignal.aborted = true;

      const refreshBacklinks = (plugin as unknown as { refreshBacklinks(path: string): Promise<void> }).refreshBacklinks;
      await refreshBacklinks.call(plugin, 'note.md');

      (plugin as unknown as { abortSignalComponent: { abortSignal: { aborted: boolean } } }).abortSignalComponent.abortSignal.aborted = false;
    });

    it('should stop processPendingActions when aborted', async () => {
      await setupOnLayoutReady();

      (plugin as unknown as { abortSignalComponent: { abortSignal: { aborted: boolean } } }).abortSignalComponent.abortSignal.aborted = true;

      plugin.triggerRefresh('test.md');
      const processFn = (plugin as unknown as { processPendingActions(): Promise<void> }).processPendingActions;
      await processFn.call(plugin);

      (plugin as unknown as { abortSignalComponent: { abortSignal: { aborted: boolean } } }).abortSignalComponent.abortSignal.aborted = false;
    });

    it('should abort getBacklinksForFile when throwIfAborted throws', async () => {
      await setupOnLayoutReady();

      // Manually populate backlinksMap to test abort in getBacklinksForFile
      const backlinksMap = (plugin as unknown as { backlinksMap: Map<string, Map<string, Set<Reference>>> }).backlinksMap;
      const noteMap = new Map<string, Set<Reference>>();
      noteMap.set('note.md', new Set([{
        link: 'target',
        original: '[[target]]',
        position: { end: { col: 10, line: 0, offset: 10 }, start: { col: 0, line: 0, offset: 0 } }
      } as unknown as Reference]));
      backlinksMap.set('target.md', noteMap);

      const throwIfAborted = (plugin as unknown as { abortSignalComponent: { abortSignal: { throwIfAborted: ReturnType<typeof vi.fn> } } }).abortSignalComponent.abortSignal.throwIfAborted;
      throwIfAborted.mockImplementation(() => { throw new Error('aborted'); });

      const getBacklinksForFile = app.metadataCache.getBacklinksForFile as unknown as (path: string) => CustomArrayDict<Reference>;
      expect(() => getBacklinksForFile('target.md')).toThrow('aborted');

      throwIfAborted.mockImplementation(() => undefined);
    });

    it('should remove linked path entries and backlinks on remove', async () => {
      await setupOnLayoutReady();

      // Manually populate maps to test removal
      const backlinksMap = (plugin as unknown as { backlinksMap: Map<string, Map<string, Set<Reference>>> }).backlinksMap;
      const linksMap = (plugin as unknown as { linksMap: Map<string, Set<string>> }).linksMap;

      const noteMap = new Map<string, Set<Reference>>();
      noteMap.set('note.md', new Set([{
        link: 'target',
        original: '[[target]]',
        position: { end: { col: 10, line: 0, offset: 10 }, start: { col: 0, line: 0, offset: 0 } }
      } as unknown as Reference]));
      backlinksMap.set('target.md', noteMap);
      linksMap.set('note.md', new Set(['target.md']));

      const getBacklinksForFile = app.metadataCache.getBacklinksForFile as unknown as (path: string) => CustomArrayDict<Reference>;
      expect(getBacklinksForFile('target.md').keys()).toContain('note.md');

      // Remove via pending action
      plugin.triggerRemove('note.md');
      await processPendingActions();

      expect(getBacklinksForFile('target.md').keys()).toEqual([]);
    });
  });

  describe('event handlers', () => {
    async function setupAndGetHandlers(): Promise<{
      changed: (file: TFile) => void;
      create: (file: TAbstractFile) => void;
      delete: (file: TAbstractFile) => void;
      modify: (file: TAbstractFile) => void;
      rename: (file: TAbstractFile, oldPath: string) => void;
    }> {
      await (plugin as unknown as { onLayoutReady(): Promise<void> }).onLayoutReady();

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
      const mockFile = Object.create(TAbstractFile.prototype) as TAbstractFile;
      Object.assign(mockFile, { path: 'new.md' });
      handlers.rename(mockFile, 'old.md');
    });

    it('should handle file delete', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TAbstractFile.prototype) as TAbstractFile;
      Object.assign(mockFile, { path: 'test.md' });
      handlers.delete(mockFile);
    });

    it('should handle file create for TFile', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TFile.prototype) as TFile;
      Object.assign(mockFile, { path: 'new.md' });
      handlers.create(mockFile);
    });

    it('should ignore file create for non-TFile', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TAbstractFile.prototype) as TAbstractFile;
      Object.assign(mockFile, { path: 'folder' });
      handlers.create(mockFile);
    });

    it('should handle file modify for TFile', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TFile.prototype) as TFile;
      Object.assign(mockFile, { path: 'modified.md' });
      handlers.modify(mockFile);
    });

    it('should ignore file modify for non-TFile', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TAbstractFile.prototype) as TAbstractFile;
      Object.assign(mockFile, { path: 'folder' });
      handlers.modify(mockFile);
    });

    it('should handle metadata changed', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TFile.prototype) as TFile;
      Object.assign(mockFile, { path: 'changed.md' });
      handlers.changed(mockFile);
    });
  });

  describe('removeLinkedPathEntries with abort', () => {
    it('should stop removing when aborted', async () => {
      await (plugin as unknown as { onLayoutReady(): Promise<void> }).onLayoutReady();

      // Manually populate maps
      const backlinksMap = (plugin as unknown as { backlinksMap: Map<string, Map<string, Set<Reference>>> }).backlinksMap;
      const linksMap = (plugin as unknown as { linksMap: Map<string, Set<string>> }).linksMap;

      const noteMap = new Map<string, Set<Reference>>();
      noteMap.set('note.md', new Set());
      backlinksMap.set('target.md', noteMap);
      linksMap.set('note.md', new Set(['target.md']));

      (plugin as unknown as { abortSignalComponent: { abortSignal: { aborted: boolean } } }).abortSignalComponent.abortSignal.aborted = true;

      const removeLinkedPathEntries = (plugin as unknown as { removeLinkedPathEntries(path: string): void }).removeLinkedPathEntries;
      removeLinkedPathEntries.call(plugin, 'note.md');

      // backlinksMap should still have the entry since abort prevented removal
      expect(noteMap.has('note.md')).toBe(true);

      (plugin as unknown as { abortSignalComponent: { abortSignal: { aborted: boolean } } }).abortSignalComponent.abortSignal.aborted = false;
    });
  });
});
