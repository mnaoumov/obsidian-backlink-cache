import type {
  App,
  CachedMetadata,
  TAbstractFile
} from 'obsidian';
import type { CanvasData } from 'obsidian/canvas.d.ts';

import { TFile } from 'obsidian';

import {
  bypassStrictProxy,
  strictProxy
} from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { Plugin } from './plugin.ts';

type PatchFactory = (next: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown;
type PatchMap = Record<string, PatchFactory>;

const registeredPatches: Array<{ patches: PatchMap; target: object }> = [];
const registeredEventHandlers: Array<{ callback: (...args: unknown[]) => void; event: string }> = [];
const registeredCleanups: Array<() => void> = [];

vi.mock('obsidian-dev-utils/async', () => ({
  invokeAsyncSafely: vi.fn((fn: () => Promise<void>) => fn())
}));

vi.mock('obsidian-dev-utils/object-utils', () => ({
  getPrototypeOf: vi.fn((obj: object) => Object.getPrototypeOf(obj) as object)
}));

vi.mock('obsidian-dev-utils/obsidian/components/monkey-around-component', () => ({
  MonkeyAroundComponent: class MockMonkeyAroundComponent {
    public registerPatch(target: object, patches: PatchMap): void {
      registeredPatches.push({ patches, target });
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

const { isCanvasFile } = await import('obsidian-dev-utils/obsidian/file-system');
const { loop } = await import('obsidian-dev-utils/obsidian/loop');
const { getAllLinks } = await import('obsidian-dev-utils/obsidian/metadata-cache');
const { reloadBacklinksView } = await import('./backlink-core-plugin.ts');
const { parseMetadataEx } = await import('./metadata.ts');

const { initCanvasHandlers, initCanvasMetadataCache, isCanvasPluginEnabled } = await import('./canvas.ts');

function createMockPlugin(): Plugin {
  const plugin = strictProxy<Plugin>({
    addChild: vi.fn().mockImplementation((child: unknown) => child),
    app: {
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
    },
    getAbortSignal: vi.fn().mockReturnValue({ aborted: false }),
    getPluginSettings: vi.fn().mockReturnValue({ shouldShowProgressBarOnLoad: false }),
    register: vi.fn().mockImplementation((fn: () => void) => {
      registeredCleanups.push(fn);
    }),
    registerEvent: vi.fn(),
    triggerRefresh: vi.fn(),
    triggerRemove: vi.fn()
  });
  bypassStrictProxy(plugin.app.metadataCache).resolvedLinks = {};
  bypassStrictProxy(plugin.app.metadataCache).unresolvedLinks = {};
  return plugin;
}

beforeEach(() => {
  registeredPatches.length = 0;
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

describe('initCanvasHandlers', () => {
  it('should register getCache patch and event handlers', () => {
    const plugin = createMockPlugin();

    initCanvasHandlers(plugin);

    expect(registeredPatches.length).toBeGreaterThanOrEqual(1);
    expect(registeredEventHandlers.length).toBe(4);
    expect(registeredEventHandlers.map((h) => h.event)).toEqual(['create', 'modify', 'delete', 'rename']);
  });

  it('should register canvas core plugin patches when canvas plugin exists', () => {
    const canvasCorePlugin = {
      enabled: false,
      instance: Object.create({
        onUserDisable: vi.fn(),
        onUserEnable: vi.fn()
      }) as object
    };

    const plugin = createMockPlugin();
    vi.mocked(plugin.app.internalPlugins.getPluginById).mockReturnValue(canvasCorePlugin as never);

    initCanvasHandlers(plugin);

    const canvasPatches = registeredPatches.find((p) => !!p.patches['onUserEnable'] && !!p.patches['onUserDisable']);
    expect(canvasPatches).toBeDefined();
    expect(registeredCleanups.length).toBe(1);
  });

  it('should process all canvas files when canvas plugin is already enabled', () => {
    const canvasCorePlugin = {
      enabled: true,
      instance: Object.create({
        onUserDisable: vi.fn(),
        onUserEnable: vi.fn()
      }) as object
    };

    const plugin = createMockPlugin();
    vi.mocked(plugin.app.internalPlugins.getPluginById).mockReturnValue(canvasCorePlugin as never);

    initCanvasHandlers(plugin);

    expect(loop).toHaveBeenCalled();
  });

  it('should handle file create event for canvas files', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const plugin = createMockPlugin();

    initCanvasHandlers(plugin);

    const createHandler = registeredEventHandlers.find((h) => h.event === 'create');
    const mockFile = Object.create(TFile.prototype) as TFile;
    Object.assign(mockFile, { path: 'test.canvas', stat: { ctime: 0, mtime: 0, size: 0 } });

    createHandler?.callback(mockFile);

    await vi.waitFor(() => {
      expect(plugin.triggerRefresh).toHaveBeenCalled();
    });
  });

  it('should ignore create event for non-canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(false);
    const plugin = createMockPlugin();

    initCanvasHandlers(plugin);

    const createHandler = registeredEventHandlers.find((h) => h.event === 'create');
    const mockFile = strictProxy<TAbstractFile>({ path: 'test.md' });

    createHandler?.callback(mockFile);

    expect(plugin.triggerRefresh).not.toHaveBeenCalled();
  });

  it('should handle file delete event for canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const plugin = createMockPlugin();

    initCanvasHandlers(plugin);

    const deleteHandler = registeredEventHandlers.find((h) => h.event === 'delete');
    const mockFile = strictProxy<TAbstractFile>({ path: 'test.canvas' });

    deleteHandler?.callback(mockFile);
  });

  it('should ignore delete event for non-canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(false);
    const plugin = createMockPlugin();

    initCanvasHandlers(plugin);

    const deleteHandler = registeredEventHandlers.find((h) => h.event === 'delete');
    const mockFile = strictProxy<TAbstractFile>({ path: 'test.md' });

    deleteHandler?.callback(mockFile);
  });

  it('should handle file rename event for canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const plugin = createMockPlugin();

    initCanvasHandlers(plugin);

    const renameHandler = registeredEventHandlers.find((h) => h.event === 'rename');
    const mockFile = strictProxy<TAbstractFile>({ path: 'new.canvas' });

    renameHandler?.callback(mockFile, 'old.canvas');
  });

  it('should ignore rename event for non-canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(false);
    const plugin = createMockPlugin();

    initCanvasHandlers(plugin);

    const renameHandler = registeredEventHandlers.find((h) => h.event === 'rename');
    const mockFile = strictProxy<TAbstractFile>({ path: 'new.md' });

    renameHandler?.callback(mockFile, 'old.md');
  });

  it('should handle file modify event for canvas files', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const plugin = createMockPlugin();

    initCanvasHandlers(plugin);

    const modifyHandler = registeredEventHandlers.find((h) => h.event === 'modify');
    const mockFile = Object.create(TFile.prototype) as TFile;
    Object.assign(mockFile, { path: 'test.canvas', stat: { ctime: 0, mtime: 0, size: 0 } });

    modifyHandler?.callback(mockFile);

    await vi.waitFor(() => {
      expect(plugin.triggerRefresh).toHaveBeenCalled();
    });
  });

  it('should transfer metadata cache on canvas file rename with existing cache', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const plugin = createMockPlugin();

    initCanvasHandlers(plugin);

    // Pre-populate the canvas metadata cache via initCanvasMetadataCache
    const mockFile = strictProxy<TFile>({
      path: 'old.canvas',
      stat: { ctime: 0, mtime: 0, size: 0 }
    });
    await initCanvasMetadataCache(plugin.app, mockFile);

    // Now rename - this should transfer the cache entry
    const renameHandler = registeredEventHandlers.find((h) => h.event === 'rename');
    const renamedFile = strictProxy<TAbstractFile>({ path: 'new.canvas' });
    renameHandler?.callback(renamedFile, 'old.canvas');

    // Verify the cache was transferred by checking getCache returns non-null for new path
    const getCachePatch = registeredPatches.find((p) => !!p.patches['getCache']);
    const patchedGetCache = getCachePatch?.patches['getCache']?.(vi.fn());
    const result = patchedGetCache?.('new.canvas');
    expect(result).not.toBeNull();
  });

  it('should remove canvas metadata and call triggerRemove on disable with canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const canvasCorePlugin = {
      enabled: false,
      instance: Object.create({
        onUserDisable: vi.fn(),
        onUserEnable: vi.fn()
      }) as object
    };

    const mockCanvasFile = Object.create(TFile.prototype) as TFile;
    Object.assign(mockCanvasFile, { path: 'test.canvas' });

    const plugin = createMockPlugin();
    vi.mocked(plugin.app.internalPlugins.getPluginById).mockReturnValue(canvasCorePlugin as never);
    vi.mocked(plugin.app.vault.getFiles).mockReturnValue([mockCanvasFile] as never);

    initCanvasHandlers(plugin);

    // Call onUserDisable patch
    const canvasPatches = registeredPatches.find((p) => !!p.patches['onUserDisable']);
    const patchedDisable = canvasPatches?.patches['onUserDisable']?.(vi.fn());
    patchedDisable?.();

    expect(plugin.app.metadataCache.deletePath).toHaveBeenCalledWith('test.canvas');
    expect(plugin.triggerRemove).toHaveBeenCalledWith('test.canvas');
  });

  it('should invoke processItem callback in processAllCanvasFiles via loop', async () => {
    const canvasCorePlugin = {
      enabled: true,
      instance: Object.create({
        onUserDisable: vi.fn(),
        onUserEnable: vi.fn()
      }) as object
    };

    const plugin = createMockPlugin();
    vi.mocked(plugin.app.internalPlugins.getPluginById).mockReturnValue(canvasCorePlugin as never);
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const mockCanvasFile = Object.create(TFile.prototype) as TFile;
    Object.assign(mockCanvasFile, { path: 'test.canvas', stat: { ctime: 0, mtime: 0, size: 0 } });

    // Provide canvas files so the items filter callback runs
    vi.mocked(plugin.app.vault.getFiles).mockReturnValue([mockCanvasFile] as never);

    // Make loop invoke processItem and buildNoticeMessage callbacks
    vi.mocked(loop).mockImplementation(async (opts) => {
      (opts.buildNoticeMessage as (item: TFile, str: string) => string)(mockCanvasFile, '1/1');
      await (opts.processItem as (item: TFile) => Promise<void>)(mockCanvasFile);
    });

    initCanvasHandlers(plugin);

    await vi.waitFor(() => {
      expect(plugin.triggerRefresh).toHaveBeenCalledWith('test.canvas');
    });

    // Reset loop mock for subsequent tests
    vi.mocked(loop).mockReset();
  });

  it('should stop removeCanvasMetadataCache when aborted', () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const canvasCorePlugin = {
      enabled: false,
      instance: Object.create({
        onUserDisable: vi.fn(),
        onUserEnable: vi.fn()
      }) as object
    };

    const mockCanvasFile1 = Object.create(TFile.prototype) as TFile;
    Object.assign(mockCanvasFile1, { path: 'a.canvas' });
    const mockCanvasFile2 = Object.create(TFile.prototype) as TFile;
    Object.assign(mockCanvasFile2, { path: 'b.canvas' });

    const plugin = createMockPlugin();
    vi.mocked(plugin.app.internalPlugins.getPluginById).mockReturnValue(canvasCorePlugin as never);
    vi.mocked(plugin.app.vault.getFiles).mockReturnValue([mockCanvasFile1, mockCanvasFile2] as never);

    // Abort after first file
    let callCount = 0;
    vi.mocked(plugin.getAbortSignal).mockImplementation(() => {
      callCount++;
      return { aborted: callCount > 1 } as AbortSignal;
    });

    initCanvasHandlers(plugin);

    const canvasPatches = registeredPatches.find((p) => !!p.patches['onUserDisable']);
    const patchedDisable = canvasPatches?.patches['onUserDisable']?.(vi.fn());
    patchedDisable?.();

    // Only first file should be processed
    expect(plugin.app.metadataCache.deletePath).toHaveBeenCalledTimes(1);
    expect(plugin.app.metadataCache.deletePath).toHaveBeenCalledWith('a.canvas');
  });

  it('should call onCanvasCorePluginDisable on cleanup', () => {
    const canvasCorePlugin = {
      enabled: false,
      instance: Object.create({
        onUserDisable: vi.fn(),
        onUserEnable: vi.fn()
      }) as object
    };

    const plugin = createMockPlugin();
    vi.mocked(plugin.app.internalPlugins.getPluginById).mockReturnValue(canvasCorePlugin as never);

    initCanvasHandlers(plugin);

    expect(registeredCleanups.length).toBe(1);
    registeredCleanups[0]?.();

    expect(reloadBacklinksView).toHaveBeenCalled();
  });

  it('should handle onUserEnable patch', () => {
    const canvasCorePlugin = {
      enabled: false,
      instance: Object.create({
        onUserDisable: vi.fn(),
        onUserEnable: vi.fn()
      }) as object
    };

    const plugin = createMockPlugin();
    vi.mocked(plugin.app.internalPlugins.getPluginById).mockReturnValue(canvasCorePlugin as never);

    initCanvasHandlers(plugin);

    const canvasPatches = registeredPatches.find((p) => !!p.patches['onUserEnable']);
    const patchedEnable = canvasPatches?.patches['onUserEnable']?.(vi.fn());
    patchedEnable?.();

    expect(loop).toHaveBeenCalled();
  });

  it('should handle onUserDisable patch', () => {
    const canvasCorePlugin = {
      enabled: false,
      instance: Object.create({
        onUserDisable: vi.fn(),
        onUserEnable: vi.fn()
      }) as object
    };

    const plugin = createMockPlugin();
    vi.mocked(plugin.app.internalPlugins.getPluginById).mockReturnValue(canvasCorePlugin as never);

    initCanvasHandlers(plugin);

    const canvasPatches = registeredPatches.find((p) => !!p.patches['onUserDisable']);
    const patchedDisable = canvasPatches?.patches['onUserDisable']?.(vi.fn());
    patchedDisable?.();

    expect(reloadBacklinksView).toHaveBeenCalled();
  });

  it('should return cached metadata for canvas files via getCache patch', () => {
    const plugin = createMockPlugin();

    initCanvasHandlers(plugin);

    const getCachePatch = registeredPatches.find((p) => !!p.patches['getCache']);
    expect(getCachePatch).toBeDefined();

    const nextFn = vi.fn().mockReturnValue({ sections: [] });
    const patchedGetCache = getCachePatch?.patches['getCache']?.(nextFn);

    vi.mocked(isCanvasFile).mockReturnValue(false);
    patchedGetCache?.('test.md');
    expect(nextFn).toHaveBeenCalledWith('test.md');

    vi.mocked(isCanvasFile).mockReturnValue(true);
    const result = patchedGetCache?.('uncached.canvas');
    expect(result).toBeNull();
  });
});

describe('initCanvasMetadataCache', () => {
  function createCanvasApp(overrides: { content?: string; getFirstLinkpathDest?: ReturnType<typeof vi.fn> } = {}): App {
    // metadataCache uses plain objects (not strictProxy) because addCanvasMetadata
    // uses dynamic property access on resolvedLinks/unresolvedLinks
    const metadataCache = {
      getFirstLinkpathDest: overrides.getFirstLinkpathDest ?? vi.fn().mockReturnValue(null),
      resolvedLinks: {} as Record<string, Record<string, number>>,
      saveFileCache: vi.fn(),
      saveMetaCache: vi.fn(),
      unresolvedLinks: {} as Record<string, Record<string, number>>
    };
    return {
      metadataCache,
      vault: {
        read: vi.fn().mockResolvedValue(overrides.content ?? '{}'),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(0))
      }
    } as unknown as App;
  }

  it('should skip non-canvas files', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(false);

    const app = strictProxy<App>({});
    const file = strictProxy<TFile>({ path: 'test.md' });

    await initCanvasMetadataCache(app, file);
  });

  it('should parse canvas data with file nodes', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const canvasData: CanvasData = {
      edges: [],
      nodes: [{ file: 'target.md', height: 100, id: 'node1', type: 'file', width: 100, x: 0, y: 0 }]
    };

    const app = createCanvasApp({ content: JSON.stringify(canvasData) });

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await initCanvasMetadataCache(app, file);

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
    vi.mocked(getAllLinks).mockReturnValue([link] as never);
    vi.mocked(parseMetadataEx).mockResolvedValue({ links: [link] } as CachedMetadata);

    const app = createCanvasApp({
      content: JSON.stringify(canvasData),
      getFirstLinkpathDest: vi.fn().mockReturnValue(strictProxy<TFile>({ path: 'target.md' }))
    });

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await initCanvasMetadataCache(app, file);

    expect(parseMetadataEx).toHaveBeenCalledWith(app, '[[target]]');
    expect(app.metadataCache.saveMetaCache).toHaveBeenCalled();
  });

  it('should handle invalid canvas JSON', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const app = createCanvasApp({ content: 'invalid json' });

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await initCanvasMetadataCache(app, file);

    expect(app.metadataCache.saveFileCache).toHaveBeenCalled();
  });

  it('should handle canvas data without nodes array', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const app = createCanvasApp({ content: JSON.stringify({ edges: [] }) });

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await initCanvasMetadataCache(app, file);

    expect(app.metadataCache.saveFileCache).toHaveBeenCalled();
  });

  it('should skip unknown node types', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const canvasData = {
      edges: [],
      nodes: [{ height: 100, id: 'node1', type: 'group', width: 100, x: 0, y: 0 }]
    };

    const app = createCanvasApp({ content: JSON.stringify(canvasData) });

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await initCanvasMetadataCache(app, file);

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

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await initCanvasMetadataCache(app, file);

    // Both links should be in unresolvedLinks for the same canvas path
    const unresolvedLinks = (app.metadataCache as unknown as { unresolvedLinks: Record<string, Record<string, number>> }).unresolvedLinks;
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

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await initCanvasMetadataCache(app, file);

    const resolvedLinks = (app.metadataCache as unknown as { resolvedLinks: Record<string, Record<string, number>> }).resolvedLinks;
    expect(resolvedLinks['test.canvas']).toBeDefined();
    expect(resolvedLinks['test.canvas']?.['target.md']).toBe(1);
  });
});
