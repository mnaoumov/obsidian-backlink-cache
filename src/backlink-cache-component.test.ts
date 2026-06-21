import type {
  CustomArrayDict,
  DataAdapterEx
} from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  CachedMetadata,
  LinkCache,
  Reference,
  ReferenceCache,
  WorkspaceLeaf
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { ConsoleDebugComponent } from 'obsidian-dev-utils/obsidian/components/console-debug-component';
// eslint-disable-next-line import-x/no-namespace -- Type-only namespace alias used for vitest's importOriginal<T>() without dynamic import() in type position.
import type * as FileSystemModule from 'obsidian-dev-utils/obsidian/file-system';
// eslint-disable-next-line import-x/no-namespace -- Type-only namespace alias used for vitest's importOriginal<T>() without dynamic import() in type position.
import type * as LinkModule from 'obsidian-dev-utils/obsidian/link';

import {
  Component,
  MarkdownView,
  TAbstractFile,
  TFile
} from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  getFileOrNull,
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
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { BacklinkCacheComponent } from './backlink-cache-component.ts';
import { reloadBacklinksView } from './backlink-core-plugin.ts';
import { isCanvasPluginEnabled } from './canvas.ts';
import { PluginSettings } from './plugin-settings.ts';

vi.mock('obsidian-dev-utils/obsidian/file-system', async (importOriginal) => {
  const original = await importOriginal<typeof FileSystemModule>();
  return {
    ...original,
    getFileOrNull: vi.fn(),
    isCanvasFile: vi.fn().mockReturnValue(false)
  };
});

vi.mock('obsidian-dev-utils/obsidian/link', async (importOriginal) => ({
  ...await importOriginal<typeof LinkModule>(),
  extractLinkFile: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/loop', () => ({
  loop: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/metadata-cache', () => ({
  getAllLinks: vi.fn().mockReturnValue([]),
  getCacheSafe: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/reference', () => ({
  sortReferences: vi.fn((refs: Reference[]) => refs)
}));

vi.mock('obsidian-dev-utils/obsidian/vault', () => ({
  getMarkdownFilesSorted: vi.fn().mockReturnValue([])
}));

vi.mock('./backlink-core-plugin.ts', () => ({
  BacklinksCorePluginComponent: class MockBacklinksCorePluginComponent extends Component {},
  reloadBacklinksView: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('./canvas.ts', () => ({
  CanvasComponent: class MockCanvasComponent extends Component {},
  isCanvasPluginEnabled: vi.fn().mockReturnValue(true)
}));

interface ComponentInternals {
  backlinksMap: Map<string, Map<string, Set<Reference>>>;
  linksMap: Map<string, Set<string>>;
  onLayoutReady(): Promise<void>;
  pendingActions: Map<string, number>;
  processPendingActions(): Promise<void>;
  refreshBacklinks(path: string): Promise<void>;
  removeLinkedPathEntries(path: string): void;
  resolvedBasenameMap: Map<string, Set<string>>;
  unresolvedBasenameMap: Map<string, Set<string>>;
  unresolvedLinksMap: Map<string, Set<string>>;
}

interface DifferentialCase {
  existingSources: Set<string>;
  fileNames: string[];
  graph: LinkGraph;
  name: string;
}

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

type LinkGraph = Map<string, SourceLinks>;

interface MutableAbortSignal {
  aborted: boolean;
  throwIfAborted: ReturnType<typeof vi.fn>;
}

interface SourceLinks {
  resolved: string[];
  unresolved: string[];
}

interface TestContext {
  abortSignal: MutableAbortSignal;
  app: App;
  component: BacklinkCacheComponent;
  settings: PluginSettings;
}

function addToSet(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key);

  if (!set) {
    set = new Set<string>();
    map.set(key, set);
  }

  set.add(value);
}

function asInternals(component: BacklinkCacheComponent): ComponentInternals {
  return castTo<ComponentInternals>(component);
}

function basenameLower(path: string): string {
  return getBasename(path).toLowerCase();
}

function createLink(linkText: string): ReferenceCache {
  return strictProxy<ReferenceCache>({
    link: linkText,
    original: `[[${linkText}]]`,
    position: { end: { col: 0, line: 0, offset: 0 }, start: { col: 0, line: 0, offset: 0 } }
  });
}

function createMockApp(): App {
  return strictProxy<App>({
    metadataCache: {
      getBacklinksForFile: vi.fn(),
      getCachedFiles: vi.fn().mockReturnValue([]),
      on: vi.fn().mockReturnValue({ id: 'event' }),
      queueFileForLinkResolution: vi.fn(),
      updateRelatedLinks: vi.fn()
    },
    vault: {
      adapter: strictProxy<DataAdapterEx>({ insensitive: false }),
      getAbstractFileByPath: vi.fn().mockReturnValue(null),
      getFileByPath: vi.fn().mockReturnValue(null),
      on: vi.fn().mockReturnValue({ id: 'event' })
    },
    workspace: {
      getLeavesOfType: vi.fn().mockReturnValue([]),
      onLayoutReady: vi.fn()
    }
  });
}

function createTestContext(): TestContext {
  const app = createMockApp();
  const abortSignal: MutableAbortSignal = { aborted: false, throwIfAborted: vi.fn() };
  const settings = new PluginSettings();

  const component = new BacklinkCacheComponent({
    abortSignalComponent: strictProxy<AbortSignalComponent>({ abortSignal: castTo<AbortSignal>(abortSignal) }),
    app,
    consoleDebugComponent: strictProxy<ConsoleDebugComponent>({ consoleDebug: vi.fn() }),
    pluginSettingsComponent: strictProxy<PluginSettingsComponent>({ settings })
  });

  return { abortSignal, app, component, settings };
}

function createTFile(path: string): TFile {
  return strictProxy<TFile>({
    name: getBasename(path),
    path
  });
}

function getBacklinksForFileFn(app: App): GetBacklinksForFileFn {
  return castTo<GetBacklinksForFileFn>(app.metadataCache.getBacklinksForFile);
}

function getBasename(path: string): string {
  const slashIndex = path.lastIndexOf('/');
  return slashIndex === -1 ? path : path.slice(slashIndex + 1);
}

function oracleQueuedPaths(graph: LinkGraph, fileNames: string[], existingSources: Set<string>): Set<string> {
  const loweredFileNames = fileNames.map((fileName) => fileName.toLowerCase());
  const strippedFileNames: string[] = [];

  for (const loweredFileName of loweredFileNames) {
    if (loweredFileName.endsWith('.md')) {
      strippedFileNames.push(loweredFileName.slice(0, -'.md'.length));
    }
    strippedFileNames.push(loweredFileName);
  }

  const queued = new Set<string>();

  for (const [source, links] of graph) {
    const resolvedMatch = links.resolved.some((target) => loweredFileNames.includes(basenameLower(target)));
    const unresolvedMatch = links.unresolved.some((linkText) => strippedFileNames.includes(basenameLower(splitSubpath(linkText).linkPath)));

    if ((resolvedMatch || unresolvedMatch) && existingSources.has(source)) {
      queued.add(source);
    }
  }

  return queued;
}

function populateIndexFromGraph(internals: ComponentInternals, graph: LinkGraph): void {
  for (const [source, links] of graph) {
    for (const target of links.resolved) {
      addToSet(internals.resolvedBasenameMap, basenameLower(target), source);
    }

    for (const linkText of links.unresolved) {
      const unresolvedBasename = basenameLower(splitSubpath(linkText).linkPath);
      addToSet(internals.unresolvedBasenameMap, unresolvedBasename, source);
      addToSet(internals.unresolvedLinksMap, source, unresolvedBasename);
    }
  }
}

describe('BacklinkCacheComponent', () => {
  let context: TestContext;

  beforeEach(() => {
    vi.useFakeTimers();
    context = createTestContext();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
      vi.mocked(context.app.workspace.getLeavesOfType).mockReturnValue(castTo<WorkspaceLeaf[]>([mockLeaf]));

      await context.component.refreshBacklinkPanels();

      expect(reloadBacklinksView).toHaveBeenCalledWith(context.app);
      expect(recomputeBacklink).toHaveBeenCalled();
    });

    it('should skip non-MarkdownView and views without backlinks', async () => {
      const mockLeaves = [
        { view: {} },
        { view: Object.assign(Object.create(MarkdownView.prototype), { backlinks: null }) }
      ];
      vi.mocked(context.app.workspace.getLeavesOfType).mockReturnValue(castTo<WorkspaceLeaf[]>(mockLeaves));

      await context.component.refreshBacklinkPanels();
      expect(reloadBacklinksView).toHaveBeenCalled();
    });

    it('should stop when aborted', async () => {
      const recomputeBacklink = vi.fn();
      const mockLeaf = {
        view: Object.assign(Object.create(MarkdownView.prototype), {
          backlinks: { file: strictProxy<TFile>({ path: 'test.md' }), recomputeBacklink }
        })
      };
      vi.mocked(context.app.workspace.getLeavesOfType).mockReturnValue(castTo<WorkspaceLeaf[]>([mockLeaf]));

      context.abortSignal.aborted = true;

      await context.component.refreshBacklinkPanels();
      expect(recomputeBacklink).not.toHaveBeenCalled();
    });
  });

  describe('onLayoutReady and internal methods', () => {
    async function setupOnLayoutReady(): Promise<void> {
      context.component.load();
      await asInternals(context.component).onLayoutReady();
    }

    async function processPendingActions(): Promise<void> {
      await asInternals(context.component).processPendingActions.call(context.component);
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
        opts.buildNoticeMessage(mockFile, '1/1');
        await (opts.processItem as (item: TFile) => Promise<void>)(mockFile);
      });

      await setupOnLayoutReady();

      expect(getCacheSafe).toHaveBeenCalled();
    });

    it('should return backlinks via getBacklinksForFile', async () => {
      await setupOnLayoutReady();

      const result = getBacklinksForFileFn(context.app)('test.md');
      expect(result.keys()).toEqual([]);
    });

    it('should return backlinks via getBacklinksForFileSafe', async () => {
      await setupOnLayoutReady();

      const result = await getBacklinksForFileFn(context.app).safe('test.md');
      expect(result.keys()).toEqual([]);
    });

    it('should expose originalFn', async () => {
      await setupOnLayoutReady();

      expect(getBacklinksForFileFn(context.app).originalFn).toBeDefined();
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

      context.component.triggerRefresh('note.md');
      await processPendingActions();

      const result = getBacklinksForFileFn(context.app)('target.md');
      expect(result.keys()).toContain('note.md');
    });

    it('should process remove action', async () => {
      await setupOnLayoutReady();

      context.component.triggerRemove('test.md');
      await processPendingActions();

      expect(getBacklinksForFileFn(context.app)('test.md').keys()).toEqual([]);
    });

    it('should refresh backlink panels after actions when setting is enabled', async () => {
      context.settings.shouldAutomaticallyRefreshBacklinkPanels = true;

      vi.mocked(getFileOrNull).mockReturnValue(null);

      await setupOnLayoutReady();

      context.component.triggerRefresh('test.md');
      await processPendingActions();

      expect(reloadBacklinksView).toHaveBeenCalled();
    });

    it('should handle non-existent file in refreshBacklinks', async () => {
      vi.mocked(getFileOrNull).mockReturnValue(null);

      await setupOnLayoutReady();
      context.component.triggerRefresh('nonexistent.md');
      await processPendingActions();

      expect(getFileOrNull).toHaveBeenCalled();
    });

    it('should skip canvas files when canvas plugin is disabled', async () => {
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'test.canvas' });

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(isCanvasFile).mockReturnValue(true);
      vi.mocked(isCanvasPluginEnabled).mockReturnValue(false);

      await setupOnLayoutReady();
      context.component.triggerRefresh('test.canvas');
      await processPendingActions();

      expect(isCanvasPluginEnabled).toHaveBeenCalled();
    });

    it('should handle null cache in refreshBacklinks', async () => {
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'note.md' });

      vi.mocked(getFileOrNull).mockReturnValue(mockFile);
      vi.mocked(getCacheSafe).mockResolvedValue(null);

      await setupOnLayoutReady();

      await asInternals(context.component).refreshBacklinks.call(context.component, 'note.md');

      expect(getCacheSafe).toHaveBeenCalled();
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

      await asInternals(context.component).refreshBacklinks.call(context.component, 'note.md');

      expect(extractLinkFile).toHaveBeenCalledWith(context.app, mockLink, 'note.md', true);
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

      await asInternals(context.component).refreshBacklinks.call(context.component, 'note.md');

      const backlinksMap = asInternals(context.component).backlinksMap;
      const noteLinks = backlinksMap.get('target.md')?.get('note.md');
      expect(noteLinks?.size).toBe(2);
    });

    it('should throw for unknown action type', async () => {
      await setupOnLayoutReady();

      const pendingActions = asInternals(context.component).pendingActions;
      pendingActions.set('test.md', 999);

      const processFn = asInternals(context.component).processPendingActions;
      await expect(processFn.call(context.component)).rejects.toThrow('Unknown action');
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

      context.abortSignal.aborted = true;

      await asInternals(context.component).refreshBacklinks.call(context.component, 'note.md');

      const backlinksMap = asInternals(context.component).backlinksMap;
      expect(backlinksMap.has('target.md')).toBe(false);
    });

    it('should stop processPendingActions when aborted', async () => {
      await setupOnLayoutReady();

      context.abortSignal.aborted = true;
      vi.mocked(getFileOrNull).mockClear();

      context.component.triggerRefresh('test.md');
      await asInternals(context.component).processPendingActions.call(context.component);

      expect(getFileOrNull).not.toHaveBeenCalled();
    });

    it('should abort getBacklinksForFile when throwIfAborted throws', async () => {
      await setupOnLayoutReady();

      const backlinksMap = asInternals(context.component).backlinksMap;
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

      context.abortSignal.throwIfAborted.mockImplementation(() => {
        throw new Error('aborted');
      });

      expect(() => getBacklinksForFileFn(context.app)('target.md')).toThrow('aborted');
    });

    it('should remove linked path entries and backlinks on remove', async () => {
      await setupOnLayoutReady();

      const backlinksMap = asInternals(context.component).backlinksMap;
      const linksMap = asInternals(context.component).linksMap;

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

      expect(getBacklinksForFileFn(context.app)('target.md').keys()).toContain('note.md');

      context.component.triggerRemove('note.md');
      await processPendingActions();

      expect(getBacklinksForFileFn(context.app)('target.md').keys()).toEqual([]);
    });
  });

  describe('event handlers', () => {
    async function setupAndGetHandlers(): Promise<EventHandlers> {
      await asInternals(context.component).onLayoutReady();

      const vaultCalls = vi.mocked(context.app.vault.on).mock.calls;
      const metaCalls = vi.mocked(context.app.metadataCache.on).mock.calls;

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
      expect(asInternals(context.component).pendingActions.has('old.md')).toBe(true);
    });

    it('should handle file delete', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TAbstractFile.prototype);
      Object.assign(mockFile, { path: 'test.md' });
      handlers.delete(mockFile);
      expect(asInternals(context.component).pendingActions.has('test.md')).toBe(true);
    });

    it('should handle file create for TFile', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'new.md' });
      handlers.create(mockFile);
      expect(asInternals(context.component).pendingActions.has('new.md')).toBe(true);
    });

    it('should ignore file create for non-TFile', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TAbstractFile.prototype);
      Object.assign(mockFile, { path: 'folder' });
      handlers.create(mockFile);
      expect(asInternals(context.component).pendingActions.has('folder')).toBe(false);
    });

    it('should handle file modify for TFile', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'modified.md' });
      handlers.modify(mockFile);
      expect(asInternals(context.component).pendingActions.has('modified.md')).toBe(true);
    });

    it('should ignore file modify for non-TFile', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TAbstractFile.prototype);
      Object.assign(mockFile, { path: 'folder' });
      handlers.modify(mockFile);
      expect(asInternals(context.component).pendingActions.has('folder')).toBe(false);
    });

    it('should handle metadata changed', async () => {
      const handlers = await setupAndGetHandlers();
      const mockFile = Object.create(TFile.prototype);
      Object.assign(mockFile, { path: 'changed.md' });
      handlers.changed(mockFile);
      expect(asInternals(context.component).pendingActions.has('changed.md')).toBe(true);
    });
  });

  describe('removeLinkedPathEntries with abort', () => {
    it('should stop removing when aborted', async () => {
      await asInternals(context.component).onLayoutReady();

      const backlinksMap = asInternals(context.component).backlinksMap;
      const linksMap = asInternals(context.component).linksMap;

      const noteMap = new Map<string, Set<Reference>>();
      noteMap.set('note.md', new Set());
      backlinksMap.set('target.md', noteMap);
      linksMap.set('note.md', new Set(['target.md']));

      context.abortSignal.aborted = true;

      asInternals(context.component).removeLinkedPathEntries.call(context.component, 'note.md');

      expect(noteMap.has('note.md')).toBe(true);
    });

    it('should stop removing unresolved basename entries when aborted', () => {
      const internals = asInternals(context.component);
      internals.unresolvedBasenameMap.set('ghost', new Set(['note.md']));
      internals.unresolvedLinksMap.set('note.md', new Set(['ghost']));

      context.abortSignal.aborted = true;

      internals.removeLinkedPathEntries.call(context.component, 'note.md');

      expect(internals.unresolvedBasenameMap.get('ghost')).toEqual(new Set(['note.md']));
      expect(internals.unresolvedLinksMap.has('note.md')).toBe(true);
    });
  });

  describe('updateRelatedLinks index population', () => {
    async function refreshNote(notePath: string, links: ReferenceCache[]): Promise<void> {
      const noteFile = createTFile(notePath);
      vi.mocked(getFileOrNull).mockReturnValue(noteFile);
      vi.mocked(isCanvasFile).mockReturnValue(false);
      vi.mocked(getCacheSafe).mockResolvedValue(strictProxy<CachedMetadata>({ links }));
      vi.mocked(getAllLinks).mockReturnValue(links);
      await asInternals(context.component).refreshBacklinks.call(context.component, notePath);
    }

    it('should index a resolved link by target basename and add a backlink', async () => {
      const linkFile = createTFile('folder/target.md');
      vi.mocked(extractLinkFile).mockImplementation((_app, _link, _path, shouldAllowNonExistingFile) => shouldAllowNonExistingFile ? null : linkFile);

      await refreshNote('note.md', [createLink('target')]);

      const internals = asInternals(context.component);
      expect(internals.resolvedBasenameMap.get('target.md')).toEqual(new Set(['note.md']));
      expect(internals.unresolvedBasenameMap.size).toBe(0);
      expect(internals.backlinksMap.get('folder/target.md')?.has('note.md')).toBe(true);
    });

    it('should index an unresolved link to a non-existing file as a backlink and an unresolved basename', async () => {
      const nonExistingLinkFile = createTFile('folder/ghost.md');
      vi.mocked(extractLinkFile).mockImplementation((_app, _link, _path, shouldAllowNonExistingFile) => shouldAllowNonExistingFile ? nonExistingLinkFile : null);

      await refreshNote('note.md', [createLink('ghost')]);

      const internals = asInternals(context.component);
      expect(internals.unresolvedBasenameMap.get('ghost')).toEqual(new Set(['note.md']));
      expect(internals.unresolvedLinksMap.get('note.md')).toEqual(new Set(['ghost']));
      expect(internals.resolvedBasenameMap.size).toBe(0);
      expect(internals.backlinksMap.get('folder/ghost.md')?.has('note.md')).toBe(true);
    });

    it('should index an unresolved link with no resolvable file by its basename only', async () => {
      vi.mocked(extractLinkFile).mockReturnValue(null);

      await refreshNote('sub/note.md', [createLink('../outside#section')]);

      const internals = asInternals(context.component);
      expect(internals.unresolvedBasenameMap.get('outside')).toEqual(new Set(['sub/note.md']));
      expect(internals.unresolvedLinksMap.get('sub/note.md')).toEqual(new Set(['outside']));
      expect(internals.backlinksMap.size).toBe(0);
    });

    it('should clear resolved and unresolved basename entries when a source is removed', async () => {
      const linkFile = createTFile('target.md');
      vi.mocked(extractLinkFile).mockImplementation((_app, link, _path, shouldAllowNonExistingFile) => {
        if (shouldAllowNonExistingFile) {
          return null;
        }
        return link.link === 'target' ? linkFile : null;
      });

      await refreshNote('note.md', [createLink('target'), createLink('ghost')]);

      const internals = asInternals(context.component);
      expect(internals.resolvedBasenameMap.get('target.md')).toEqual(new Set(['note.md']));
      expect(internals.unresolvedBasenameMap.get('ghost')).toEqual(new Set(['note.md']));

      internals.removeLinkedPathEntries.call(context.component, 'note.md');

      expect(internals.resolvedBasenameMap.get('target.md')?.has('note.md')).toBe(false);
      expect(internals.unresolvedBasenameMap.get('ghost')?.has('note.md')).toBe(false);
      expect(internals.unresolvedLinksMap.has('note.md')).toBe(false);
    });
  });

  describe('updateRelatedLinks differential parity with the original algorithm', () => {
    const cases: DifferentialCase[] = [
      {
        existingSources: new Set(['a.md']),
        fileNames: ['foo.md'],
        graph: new Map([['a.md', { resolved: ['folder/foo.md'], unresolved: [] }]]),
        name: 'resolved delete'
      },
      {
        existingSources: new Set(['a.md', 'b.md']),
        fileNames: ['foo.md'],
        graph: new Map([
          ['a.md', { resolved: ['x/foo.md'], unresolved: [] }],
          ['b.md', { resolved: ['y/foo.md'], unresolved: [] }]
        ]),
        name: 'same-basename ambiguity (both queued)'
      },
      {
        existingSources: new Set(['a.md']),
        fileNames: ['foo.md'],
        graph: new Map([['a.md', { resolved: [], unresolved: ['foo'] }]]),
        name: 'unresolved by name with .md stripping'
      },
      {
        existingSources: new Set(['a.md']),
        fileNames: ['bar.md'],
        graph: new Map([['a.md', { resolved: [], unresolved: ['bar#section'] }]]),
        name: 'unresolved with subpath'
      },
      {
        existingSources: new Set(['a.md']),
        fileNames: ['pic.png'],
        graph: new Map([['a.md', { resolved: ['assets/pic.png'], unresolved: [] }]]),
        name: 'non-markdown target'
      },
      {
        existingSources: new Set<string>(),
        fileNames: ['foo.md'],
        graph: new Map([['folder/note.md', { resolved: ['folder/foo.md'], unresolved: [] }]]),
        name: 'source inside deleted folder (no longer exists)'
      },
      {
        existingSources: new Set(['a.md', 'b.md']),
        fileNames: ['foo.md', 'bar.md'],
        graph: new Map([
          ['a.md', { resolved: ['x/foo.md'], unresolved: [] }],
          ['b.md', { resolved: [], unresolved: ['bar'] }]
        ]),
        name: 'rename (two names)'
      },
      {
        existingSources: new Set(['a.md']),
        fileNames: ['zzz.md'],
        graph: new Map([['a.md', { resolved: ['foo.md'], unresolved: ['bar'] }]]),
        name: 'no matches'
      },
      {
        existingSources: new Set(['a.md']),
        fileNames: ['foo.md'],
        graph: new Map([['a.md', { resolved: ['foo.md'], unresolved: ['foo'] }]]),
        name: 'same source matched via resolved and unresolved (deduped)'
      }
    ];

    it.each(cases)('should queue the same set as the original for: $name', ({ existingSources, fileNames, graph }) => {
      const localContext = createTestContext();
      populateIndexFromGraph(asInternals(localContext.component), graph);
      vi.mocked(localContext.app.vault.getFileByPath).mockImplementation((path) => existingSources.has(path) ? createTFile(path) : null);

      localContext.component.updateRelatedLinks(fileNames);

      const queuedPaths = new Set(
        vi.mocked(localContext.app.metadataCache.queueFileForLinkResolution).mock.calls
          .map((call) => call[0])
          .filter((file): file is TFile => file !== null)
          .map((file) => file.path)
      );

      expect(queuedPaths).toEqual(oracleQueuedPaths(graph, fileNames, existingSources));
    });
  });

  describe('updateRelatedLinks performance characteristics', () => {
    it('should scale with the number of matches and never scan all cached files', async () => {
      context.component.load();
      await asInternals(context.component).onLayoutReady();

      const internals = asInternals(context.component);
      internals.resolvedBasenameMap.set('foo.md', new Set(['a.md', 'b.md']));
      const UNRELATED_ENTRY_COUNT = 100;
      for (let index = 0; index < UNRELATED_ENTRY_COUNT; index++) {
        internals.resolvedBasenameMap.set(`other-${String(index)}.md`, new Set([`source-${String(index)}.md`]));
      }

      vi.mocked(context.app.vault.getFileByPath).mockImplementation((path) => createTFile(path));
      vi.mocked(context.app.vault.getFileByPath).mockClear();
      vi.mocked(context.app.metadataCache.queueFileForLinkResolution).mockClear();

      context.app.metadataCache.updateRelatedLinks(['foo.md']);

      expect(context.app.metadataCache.queueFileForLinkResolution).toHaveBeenCalledTimes(2);
      expect(context.app.vault.getFileByPath).toHaveBeenCalledTimes(2);
      expect(context.app.metadataCache.getCachedFiles).not.toHaveBeenCalled();
    });
  });
});
