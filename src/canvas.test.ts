import type {
  CanvasPlugin,
  CanvasPluginInstance
} from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  MetadataCache,
  Reference,
  TAbstractFile
} from 'obsidian';
// eslint-disable-next-line import-x/no-namespace -- Type-only namespace alias used for vitest's importOriginal<T>() without dynamic import() in type position.
import type * as ObjectUtilsModule from 'obsidian-dev-utils/object-utils';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { CanvasData } from 'obsidian/canvas.d.ts';

import { TFile } from 'obsidian';
import { noop } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { isCanvasFile } from 'obsidian-dev-utils/obsidian/file-system';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import { getAllLinks } from 'obsidian-dev-utils/obsidian/metadata-cache';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { BacklinkCacheComponent } from './backlink-cache-component.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { reloadBacklinksView } from './backlink-core-plugin.ts';
import {
  CanvasComponent,
  isCanvasPluginEnabled
} from './canvas.ts';
import { parseMetadataEx } from './metadata.ts';
import { PluginSettings } from './plugin-settings.ts';

interface CanvasInternals {
  initCanvasMetadataCache(file: TFile): Promise<void>;
}
interface MutableAbortSignal {
  aborted: boolean;
  throwIfAborted: ReturnType<typeof vi.fn>;
}

interface PatchHandlerArgs {
  fallback?(): unknown;
  originalArgs?: unknown[];
  originalThis?: unknown;
}

interface RegisteredEventHandler {
  callback(...args: unknown[]): void;
  event: string;
}

interface RegisteredMethodPatch {
  methodName: string;
  obj: object;
  patchHandler(args: PatchHandlerArgs): unknown;
}

const registeredMethodPatches: RegisteredMethodPatch[] = [];
const registeredEventHandlers: RegisteredEventHandler[] = [];
const registeredCleanups: (() => void)[] = [];

vi.mock('obsidian-dev-utils/async', () => ({
  invokeAsyncSafely: vi.fn((fn: () => Promise<void>) => fn())
}));

vi.mock('obsidian-dev-utils/object-utils', async (importOriginal) => {
  const original = await importOriginal<typeof ObjectUtilsModule>();
  return {
    ...original,
    getPrototypeOf: vi.fn((obj: object) => Object.getPrototypeOf(obj) as object)
  };
});

vi.mock('obsidian-dev-utils/obsidian/components/component-ex', () => ({
  ComponentEx: class MockComponentEx {
    public addChild(child: unknown): unknown {
      return child;
    }

    public register(cb: () => void): void {
      registeredCleanups.push(cb);
    }

    public registerEvent(): void {
      noop();
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/components/monkey-around-component', () => ({
  MonkeyAroundComponent: class MockMonkeyAroundComponent {
    public registerMethodPatch(params: RegisteredMethodPatch): void {
      registeredMethodPatches.push({
        methodName: params.methodName,
        obj: params.obj,
        patchHandler: params.patchHandler
      });
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/file-system', () => ({
  isCanvasFile: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/link', () => ({
  splitSubpath: vi.fn((link: string) => ({ linkPath: link }))
}));

vi.mock('obsidian-dev-utils/obsidian/loop', () => ({
  loop: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/metadata-cache', () => ({
  getAllLinks: vi.fn(() => [])
}));

vi.mock('./backlink-core-plugin.ts', () => ({
  reloadBacklinksView: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('./metadata.ts', () => ({
  parseMetadataEx: vi.fn().mockResolvedValue({})
}));

interface CreateComponentOverrides {
  readonly abortSignal?: MutableAbortSignal;
  readonly app?: App;
}

interface CreateComponentResult {
  readonly abortSignal: MutableAbortSignal;
  readonly app: App;
  readonly backlinkCacheComponent: BacklinkCacheComponent;
  readonly component: CanvasComponent;
}

function createCanvasCorePlugin(enabled: boolean): CanvasPlugin {
  return strictProxy<CanvasPlugin>({
    enabled,
    instance: castTo<CanvasPluginInstance>(Object.create({
      onUserDisable: vi.fn(),
      onUserEnable: vi.fn()
    }))
  });
}

function createComponent(overrides: CreateComponentOverrides = {}): CreateComponentResult {
  const app = overrides.app ?? createMockApp();
  const abortSignal = overrides.abortSignal ?? { aborted: false, throwIfAborted: vi.fn() };
  const backlinkCacheComponent = strictProxy<BacklinkCacheComponent>({
    triggerRefresh: vi.fn(),
    triggerRemove: vi.fn()
  });

  const component = new CanvasComponent({
    abortSignalComponent: strictProxy<AbortSignalComponent>({ abortSignal: castTo<AbortSignal>(abortSignal) }),
    app,
    backlinkCacheComponent,
    pluginSettingsComponent: strictProxy<PluginSettingsComponent>({ settings: new PluginSettings() })
  });

  return { abortSignal, app, backlinkCacheComponent, component };
}

function createMockApp(): App {
  const app = strictProxy<App>({
    internalPlugins: {
      getEnabledPluginById: vi.fn().mockReturnValue(null),
      getPluginById: vi.fn().mockReturnValue(null)
    },
    metadataCache: {
      deletePath: vi.fn(),
      getCache: vi.fn(),
      getFirstLinkpathDest: vi.fn().mockReturnValue(null),
      saveFileCache: vi.fn(),
      saveMetaCache: vi.fn()
    },
    vault: {
      getFiles: vi.fn().mockReturnValue([]),
      on: vi.fn().mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
        registeredEventHandlers.push({ callback, event });
        return { id: event };
      }),
      read: vi.fn().mockResolvedValue('{}'),
      readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(0))
    }
  });
  app.metadataCache.resolvedLinks = {};
  app.metadataCache.unresolvedLinks = {};
  return app;
}

beforeEach(() => {
  registeredMethodPatches.length = 0;
  registeredEventHandlers.length = 0;
  registeredCleanups.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isCanvasPluginEnabled', () => {
  it('should return false when canvas plugin is not enabled', () => {
    const app = strictProxy<App>({
      internalPlugins: {
        getEnabledPluginById: vi.fn().mockReturnValue(null)
      }
    });

    expect(isCanvasPluginEnabled(app)).toBe(false);
  });

  it('should return true when canvas plugin is enabled', () => {
    const app = strictProxy<App>({
      internalPlugins: {
        getEnabledPluginById: vi.fn().mockReturnValue({})
      }
    });

    expect(isCanvasPluginEnabled(app)).toBe(true);
  });
});

describe('CanvasComponent.onload', () => {
  it('should register getCache patch and event handlers', () => {
    const { component } = createComponent();

    component.onload();

    expect(registeredMethodPatches.some((p) => p.methodName === 'getCache')).toBe(true);
    expect(registeredEventHandlers.length).toBe(4);
    expect(registeredEventHandlers.map((h) => h.event)).toEqual(['create', 'modify', 'delete', 'rename']);
  });

  it('should register canvas core plugin patches when canvas plugin exists', () => {
    const { app, component } = createComponent();
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(createCanvasCorePlugin(false));

    component.onload();

    const methodNames = registeredMethodPatches.map((p) => p.methodName);
    expect(methodNames).toContain('onUserEnable');
    expect(methodNames).toContain('onUserDisable');
    expect(registeredCleanups.length).toBe(1);
  });

  it('should process all canvas files when canvas plugin is already enabled', () => {
    const { app, component } = createComponent();
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(createCanvasCorePlugin(true));

    component.onload();

    expect(loop).toHaveBeenCalled();
  });

  it('should handle file create event for canvas files', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const { backlinkCacheComponent, component } = createComponent();

    component.onload();

    const createHandler = registeredEventHandlers.find((h) => h.event === 'create');
    const mockFile = Object.create(TFile.prototype);
    Object.assign(mockFile, { path: 'test.canvas', stat: { ctime: 0, mtime: 0, size: 0 } });

    createHandler?.callback(mockFile);

    await vi.waitFor(() => {
      expect(backlinkCacheComponent.triggerRefresh).toHaveBeenCalled();
    });
  });

  it('should ignore create event for non-canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(false);
    const { backlinkCacheComponent, component } = createComponent();

    component.onload();

    const createHandler = registeredEventHandlers.find((h) => h.event === 'create');
    const mockFile = strictProxy<TAbstractFile>({ path: 'test.md' });

    createHandler?.callback(mockFile);

    expect(backlinkCacheComponent.triggerRefresh).not.toHaveBeenCalled();
  });

  it('should handle file delete event for canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const { component } = createComponent();

    component.onload();

    const deleteHandler = registeredEventHandlers.find((h) => h.event === 'delete');
    const mockFile = strictProxy<TAbstractFile>({ path: 'test.canvas' });

    deleteHandler?.callback(mockFile);
    expect(isCanvasFile).toHaveBeenCalled();
  });

  it('should ignore delete event for non-canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(false);
    const { component } = createComponent();

    component.onload();

    const deleteHandler = registeredEventHandlers.find((h) => h.event === 'delete');
    const mockFile = strictProxy<TAbstractFile>({ path: 'test.md' });

    deleteHandler?.callback(mockFile);
    expect(isCanvasFile).toHaveBeenCalled();
  });

  it('should handle file rename event for canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const { component } = createComponent();

    component.onload();

    const renameHandler = registeredEventHandlers.find((h) => h.event === 'rename');
    const mockFile = strictProxy<TAbstractFile>({ path: 'new.canvas' });

    renameHandler?.callback(mockFile, 'old.canvas');
    expect(isCanvasFile).toHaveBeenCalled();
  });

  it('should ignore rename event for non-canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(false);
    const { component } = createComponent();

    component.onload();

    const renameHandler = registeredEventHandlers.find((h) => h.event === 'rename');
    const mockFile = strictProxy<TAbstractFile>({ path: 'new.md' });

    renameHandler?.callback(mockFile, 'old.md');
    expect(isCanvasFile).toHaveBeenCalled();
  });

  it('should handle file modify event for canvas files', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const { backlinkCacheComponent, component } = createComponent();

    component.onload();

    const modifyHandler = registeredEventHandlers.find((h) => h.event === 'modify');
    const mockFile = Object.create(TFile.prototype);
    Object.assign(mockFile, { path: 'test.canvas', stat: { ctime: 0, mtime: 0, size: 0 } });

    modifyHandler?.callback(mockFile);

    await vi.waitFor(() => {
      expect(backlinkCacheComponent.triggerRefresh).toHaveBeenCalled();
    });
  });

  it('should transfer metadata cache on canvas file rename with existing cache', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const { component } = createComponent();

    component.onload();

    const mockFile = strictProxy<TFile>({
      path: 'old.canvas',
      stat: { ctime: 0, mtime: 0, size: 0 }
    });
    await castTo<CanvasInternals>(component).initCanvasMetadataCache(mockFile);

    const renameHandler = registeredEventHandlers.find((h) => h.event === 'rename');
    const renamedFile = strictProxy<TAbstractFile>({ path: 'new.canvas' });
    renameHandler?.callback(renamedFile, 'old.canvas');

    const getCachePatch = registeredMethodPatches.find((p) => p.methodName === 'getCache');
    const result = getCachePatch?.patchHandler({ fallback: vi.fn(), originalArgs: ['new.canvas'] });
    expect(result).not.toBeNull();
  });

  it('should remove canvas metadata and call triggerRemove on disable with canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const mockCanvasFile = Object.create(TFile.prototype);
    Object.assign(mockCanvasFile, { path: 'test.canvas' });

    const { app, backlinkCacheComponent, component } = createComponent();
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(createCanvasCorePlugin(false));
    vi.mocked(app.vault.getFiles).mockReturnValue(castTo<TFile[]>([mockCanvasFile]));

    component.onload();

    const disablePatch = registeredMethodPatches.find((p) => p.methodName === 'onUserDisable');
    disablePatch?.patchHandler({});

    expect(app.metadataCache.deletePath).toHaveBeenCalledWith('test.canvas');
    expect(backlinkCacheComponent.triggerRemove).toHaveBeenCalledWith('test.canvas');
  });

  it('should invoke processItem callback in processAllCanvasFiles via loop', async () => {
    const { app, backlinkCacheComponent, component } = createComponent();
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(createCanvasCorePlugin(true));
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const mockCanvasFile = Object.create(TFile.prototype);
    Object.assign(mockCanvasFile, { path: 'test.canvas', stat: { ctime: 0, mtime: 0, size: 0 } });

    vi.mocked(app.vault.getFiles).mockReturnValue(castTo<TFile[]>([mockCanvasFile]));

    vi.mocked(loop).mockImplementation(async (opts) => {
      opts.buildNoticeMessage(mockCanvasFile, '1/1');
      await (opts.processItem as (item: TFile) => Promise<void>)(mockCanvasFile);
    });

    component.onload();

    await vi.waitFor(() => {
      expect(backlinkCacheComponent.triggerRefresh).toHaveBeenCalledWith('test.canvas');
    });

    vi.mocked(loop).mockReset();
  });

  it('should stop removeCanvasMetadataCache when aborted', () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const mockCanvasFile1 = Object.create(TFile.prototype);
    Object.assign(mockCanvasFile1, { path: 'a.canvas' });
    const mockCanvasFile2 = Object.create(TFile.prototype);
    Object.assign(mockCanvasFile2, { path: 'b.canvas' });

    let abortedCallCount = 0;
    const abortSignal: MutableAbortSignal = {
      get aborted(): boolean {
        abortedCallCount++;
        return abortedCallCount > 1;
      },
      throwIfAborted: vi.fn()
    };

    const { app, component } = createComponent({ abortSignal });
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(createCanvasCorePlugin(false));
    vi.mocked(app.vault.getFiles).mockReturnValue(castTo<TFile[]>([mockCanvasFile1, mockCanvasFile2]));

    component.onload();

    const disablePatch = registeredMethodPatches.find((p) => p.methodName === 'onUserDisable');
    disablePatch?.patchHandler({});

    expect(app.metadataCache.deletePath).toHaveBeenCalledTimes(1);
    expect(app.metadataCache.deletePath).toHaveBeenCalledWith('a.canvas');
  });

  it('should reload backlinks view on cleanup', () => {
    const { app, component } = createComponent();
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(createCanvasCorePlugin(false));

    component.onload();

    expect(registeredCleanups.length).toBe(1);
    registeredCleanups[0]?.();

    expect(reloadBacklinksView).toHaveBeenCalled();
  });

  it('should handle onUserEnable patch', () => {
    const { app, component } = createComponent();
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(createCanvasCorePlugin(false));

    component.onload();

    const enablePatch = registeredMethodPatches.find((p) => p.methodName === 'onUserEnable');
    enablePatch?.patchHandler({});

    expect(loop).toHaveBeenCalled();
  });

  it('should handle onUserDisable patch', () => {
    const { app, component } = createComponent();
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(createCanvasCorePlugin(false));

    component.onload();

    const disablePatch = registeredMethodPatches.find((p) => p.methodName === 'onUserDisable');
    disablePatch?.patchHandler({});

    expect(reloadBacklinksView).toHaveBeenCalled();
  });

  it('should return cached metadata for canvas files via getCache patch', () => {
    const { component } = createComponent();

    component.onload();

    const getCachePatch = registeredMethodPatches.find((p) => p.methodName === 'getCache');
    expect(getCachePatch).toBeDefined();

    const fallback = vi.fn().mockReturnValue({ sections: [] });

    vi.mocked(isCanvasFile).mockReturnValue(false);
    const nonCanvasResult = getCachePatch?.patchHandler({ fallback, originalArgs: ['test.md'] });
    expect(fallback).toHaveBeenCalled();
    expect(nonCanvasResult).toEqual({ sections: [] });

    vi.mocked(isCanvasFile).mockReturnValue(true);
    const result = getCachePatch?.patchHandler({ fallback, originalArgs: ['uncached.canvas'] });
    expect(result).toBeNull();
  });
});

describe('CanvasComponent.initCanvasMetadataCache', () => {
  interface CreateCanvasAppOptions {
    readonly content?: string;
    readonly getFirstLinkpathDest?: ReturnType<typeof vi.fn>;
  }

  function createCanvasApp(overrides: CreateCanvasAppOptions = {}): App {
    const metadataCache = {
      getFirstLinkpathDest: overrides.getFirstLinkpathDest ?? vi.fn().mockReturnValue(null),
      resolvedLinks: {} as MetadataCache['resolvedLinks'],
      saveFileCache: vi.fn(),
      saveMetaCache: vi.fn(),
      unresolvedLinks: {} as MetadataCache['unresolvedLinks']
    };
    return castTo<App>({
      metadataCache,
      vault: {
        read: vi.fn().mockResolvedValue(overrides.content ?? '{}'),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(0))
      }
    });
  }

  function createComponentForApp(app: App): CanvasComponent {
    return createComponent({ app }).component;
  }

  it('should skip non-canvas files', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(false);

    const app = strictProxy<App>({});
    const component = createComponentForApp(app);
    const file = strictProxy<TFile>({ path: 'test.md' });

    await castTo<CanvasInternals>(component).initCanvasMetadataCache(file);
    expect(isCanvasFile).toHaveBeenCalled();
  });

  it('should parse canvas data with file nodes', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const canvasData: CanvasData = {
      edges: [],
      nodes: [{ file: 'target.md', height: 100, id: 'node1', type: 'file', width: 100, x: 0, y: 0 }]
    };

    const app = createCanvasApp({ content: JSON.stringify(canvasData) });
    const component = createComponentForApp(app);

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await castTo<CanvasInternals>(component).initCanvasMetadataCache(file);

    expect(app.metadataCache.saveFileCache).toHaveBeenCalled();
    expect(app.metadataCache.saveMetaCache).toHaveBeenCalled();
  });

  it('should parse canvas data with text nodes', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const canvasData: CanvasData = {
      edges: [],
      nodes: [{ height: 100, id: 'node1', text: '[[target]]', type: 'text', width: 100, x: 0, y: 0 }]
    };

    const link = { link: 'target', original: '[[target]]', position: { end: { col: 10, line: 0, offset: 10 }, start: { col: 0, line: 0, offset: 0 } } };
    vi.mocked(getAllLinks).mockReturnValue(castTo<Reference[]>([link]));
    vi.mocked(parseMetadataEx).mockResolvedValue({ links: [link] });

    const app = createCanvasApp({
      content: JSON.stringify(canvasData),
      getFirstLinkpathDest: vi.fn().mockReturnValue(strictProxy<TFile>({ path: 'target.md' }))
    });
    const component = createComponentForApp(app);

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await castTo<CanvasInternals>(component).initCanvasMetadataCache(file);

    expect(parseMetadataEx).toHaveBeenCalledWith(app, '[[target]]');
    expect(app.metadataCache.saveMetaCache).toHaveBeenCalled();
  });

  it('should handle invalid canvas JSON', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const app = createCanvasApp({ content: 'invalid json' });
    const component = createComponentForApp(app);

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await castTo<CanvasInternals>(component).initCanvasMetadataCache(file);

    expect(app.metadataCache.saveFileCache).toHaveBeenCalled();
  });

  it('should handle canvas data without nodes array', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const app = createCanvasApp({ content: JSON.stringify({ edges: [] }) });
    const component = createComponentForApp(app);

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await castTo<CanvasInternals>(component).initCanvasMetadataCache(file);

    expect(app.metadataCache.saveFileCache).toHaveBeenCalled();
  });

  it('should skip unknown node types', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const canvasData = {
      edges: [],
      nodes: [{ height: 100, id: 'node1', type: 'group', width: 100, x: 0, y: 0 }]
    };

    const app = createCanvasApp({ content: JSON.stringify(canvasData) });
    const component = createComponentForApp(app);

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await castTo<CanvasInternals>(component).initCanvasMetadataCache(file);

    expect(app.metadataCache.saveFileCache).toHaveBeenCalled();
  });

  it('should handle multiple file nodes in same canvas (existing linksCache entry)', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const canvasData: CanvasData = {
      edges: [],
      nodes: [
        { file: 'target1.md', height: 100, id: 'node1', type: 'file', width: 100, x: 0, y: 0 },
        { file: 'target2.md', height: 100, id: 'node2', type: 'file', width: 100, x: 200, y: 0 }
      ]
    };

    const app = createCanvasApp({
      content: JSON.stringify(canvasData),
      getFirstLinkpathDest: vi.fn().mockReturnValue(null)
    });
    const component = createComponentForApp(app);

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await castTo<CanvasInternals>(component).initCanvasMetadataCache(file);

    const unresolvedLinks = app.metadataCache.unresolvedLinks;
    expect(unresolvedLinks['test.canvas']).toBeDefined();
    expect(unresolvedLinks['test.canvas']?.['target1.md']).toBe(1);
    expect(unresolvedLinks['test.canvas']?.['target2.md']).toBe(1);
  });

  it('should track resolved links', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const canvasData: CanvasData = {
      edges: [],
      nodes: [{ file: 'target.md', height: 100, id: 'node1', type: 'file', width: 100, x: 0, y: 0 }]
    };

    const app = createCanvasApp({
      content: JSON.stringify(canvasData),
      getFirstLinkpathDest: vi.fn().mockReturnValue(strictProxy<TFile>({ path: 'target.md' }))
    });
    const component = createComponentForApp(app);

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await castTo<CanvasInternals>(component).initCanvasMetadataCache(file);

    const resolvedLinks = app.metadataCache.resolvedLinks;
    expect(resolvedLinks['test.canvas']).toBeDefined();
    expect(resolvedLinks['test.canvas']?.['target.md']).toBe(1);
  });
});
