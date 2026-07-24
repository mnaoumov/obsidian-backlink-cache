import type {
  CanvasPlugin,
  CanvasPluginInstance
} from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  CachedMetadata,
  MetadataCache,
  Reference,
  TAbstractFile
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
// eslint-disable-next-line import-x/no-namespace -- Type-only namespace alias used for vitest's importOriginal<T>() without dynamic import() in type position.
import type * as FileSystemModule from 'obsidian-dev-utils/obsidian/file-system';
import type {
  CanvasReference,
  CanvasTextNodeReference
} from 'obsidian-dev-utils/obsidian/reference';

import { TFile } from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { getCanvasReferences } from 'obsidian-dev-utils/obsidian/canvas';
import { isCanvasFile } from 'obsidian-dev-utils/obsidian/file-system';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
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
import { PluginSettings } from './plugin-settings.ts';

interface CanvasInternals {
  initCanvasMetadataCache(file: TFile): Promise<void>;
}
interface MutableAbortSignal {
  aborted: boolean;
  throwIfAborted: ReturnType<typeof vi.fn>;
}

interface RegisteredEventHandler {
  callback(...args: unknown[]): void;
  event: string;
}

const registeredEventHandlers: RegisteredEventHandler[] = [];

vi.mock('obsidian-dev-utils/obsidian/file-system', async (importOriginal) => {
  const original = await importOriginal<typeof FileSystemModule>();
  return {
    ...original,
    isCanvasFile: vi.fn()
  };
});

vi.mock('obsidian-dev-utils/obsidian/loop', () => ({
  loop: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/canvas', () => ({
  getCanvasReferences: vi.fn().mockResolvedValue([])
}));

vi.mock('./backlink-core-plugin.ts', () => ({
  reloadBacklinksView: vi.fn().mockResolvedValue(undefined)
}));

interface CanvasInstanceProto {
  onUserDisable(): void;
  onUserEnable(): void;
}

interface CreateCanvasCorePluginResult {
  readonly instanceProto: CanvasInstanceProto;
  readonly plugin: CanvasPlugin;
}

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

function createCanvasCorePlugin(enabled: boolean): CreateCanvasCorePluginResult {
  const instanceProto: CanvasInstanceProto = {
    onUserDisable: vi.fn(),
    onUserEnable: vi.fn()
  };
  const plugin = strictProxy<CanvasPlugin>({
    enabled,
    instance: castTo<CanvasPluginInstance>(Object.create(instanceProto))
  });
  return { instanceProto, plugin };
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
    pluginNoticeComponent: strictProxy<PluginNoticeComponent>({}),
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
  app.metadataCache.app = app;
  return app;
}

beforeEach(() => {
  registeredEventHandlers.length = 0;
  vi.mocked(getCanvasReferences).mockReset();
  vi.mocked(getCanvasReferences).mockResolvedValue([]);
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
    const { app, component } = createComponent();
    const originalGetCache = app.metadataCache.getCache;

    component.load();

    expect(app.metadataCache.getCache).not.toBe(originalGetCache);
    expect(registeredEventHandlers.length).toBe(4);
    expect(registeredEventHandlers.map((h) => h.event)).toEqual(['create', 'modify', 'delete', 'rename']);
  });

  it('should register canvas core plugin patches when canvas plugin exists', () => {
    const { app, component } = createComponent();
    const { instanceProto, plugin } = createCanvasCorePlugin(false);
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(plugin);
    const originalOnUserEnable = instanceProto.onUserEnable;
    const originalOnUserDisable = instanceProto.onUserDisable;

    component.load();

    expect(instanceProto.onUserEnable).not.toBe(originalOnUserEnable);
    expect(instanceProto.onUserDisable).not.toBe(originalOnUserDisable);
  });

  it('should process all canvas files when canvas plugin is already enabled', () => {
    const { app, component } = createComponent();
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(createCanvasCorePlugin(true).plugin);

    component.load();

    expect(loop).toHaveBeenCalled();
  });

  it('should handle file create event for canvas files', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const { backlinkCacheComponent, component } = createComponent();

    component.load();

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

    component.load();

    const createHandler = registeredEventHandlers.find((h) => h.event === 'create');
    const mockFile = strictProxy<TAbstractFile>({ path: 'test.md' });

    createHandler?.callback(mockFile);

    expect(backlinkCacheComponent.triggerRefresh).not.toHaveBeenCalled();
  });

  it('should handle file delete event for canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const { component } = createComponent();

    component.load();

    const deleteHandler = registeredEventHandlers.find((h) => h.event === 'delete');
    const mockFile = strictProxy<TAbstractFile>({ path: 'test.canvas' });

    deleteHandler?.callback(mockFile);
    expect(isCanvasFile).toHaveBeenCalled();
  });

  it('should ignore delete event for non-canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(false);
    const { component } = createComponent();

    component.load();

    const deleteHandler = registeredEventHandlers.find((h) => h.event === 'delete');
    const mockFile = strictProxy<TAbstractFile>({ path: 'test.md' });

    deleteHandler?.callback(mockFile);
    expect(isCanvasFile).toHaveBeenCalled();
  });

  it('should handle file rename event for canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const { component } = createComponent();

    component.load();

    const renameHandler = registeredEventHandlers.find((h) => h.event === 'rename');
    const mockFile = strictProxy<TAbstractFile>({ path: 'new.canvas' });

    renameHandler?.callback(mockFile, 'old.canvas');
    expect(isCanvasFile).toHaveBeenCalled();
  });

  it('should ignore rename event for non-canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(false);
    const { component } = createComponent();

    component.load();

    const renameHandler = registeredEventHandlers.find((h) => h.event === 'rename');
    const mockFile = strictProxy<TAbstractFile>({ path: 'new.md' });

    renameHandler?.callback(mockFile, 'old.md');
    expect(isCanvasFile).toHaveBeenCalled();
  });

  it('should handle file modify event for canvas files', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const { backlinkCacheComponent, component } = createComponent();

    component.load();

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
    const { app, component } = createComponent();

    component.load();

    const mockFile = strictProxy<TFile>({
      path: 'old.canvas',
      stat: { ctime: 0, mtime: 0, size: 0 }
    });
    await castTo<CanvasInternals>(component).initCanvasMetadataCache(mockFile);

    const renameHandler = registeredEventHandlers.find((h) => h.event === 'rename');
    const renamedFile = strictProxy<TAbstractFile>({ path: 'new.canvas' });
    renameHandler?.callback(renamedFile, 'old.canvas');

    const result = app.metadataCache.getCache('new.canvas');
    expect(result).not.toBeNull();
  });

  it('should remove canvas metadata and call triggerRemove on disable with canvas files', () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const mockCanvasFile = Object.create(TFile.prototype);
    Object.assign(mockCanvasFile, { path: 'test.canvas' });

    const { app, backlinkCacheComponent, component } = createComponent();
    const { instanceProto, plugin } = createCanvasCorePlugin(false);
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(plugin);
    vi.mocked(app.vault.getFiles).mockReturnValue(castTo<TFile[]>([mockCanvasFile]));

    component.load();

    instanceProto.onUserDisable();

    expect(app.metadataCache.deletePath).toHaveBeenCalledWith('test.canvas');
    expect(backlinkCacheComponent.triggerRemove).toHaveBeenCalledWith('test.canvas');
  });

  it('should invoke processItem callback in processAllCanvasFiles via loop', async () => {
    const { app, backlinkCacheComponent, component } = createComponent();
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(createCanvasCorePlugin(true).plugin);
    vi.mocked(isCanvasFile).mockReturnValue(true);

    const mockCanvasFile = Object.create(TFile.prototype);
    Object.assign(mockCanvasFile, { path: 'test.canvas', stat: { ctime: 0, mtime: 0, size: 0 } });

    vi.mocked(app.vault.getFiles).mockReturnValue(castTo<TFile[]>([mockCanvasFile]));

    vi.mocked(loop).mockImplementation(async (opts) => {
      opts.buildNoticeMessage({ item: mockCanvasFile, iterationStr: '1/1' });
      await (opts.processItem as (item: TFile) => Promise<void>)(mockCanvasFile);
    });

    component.load();

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
    const { instanceProto, plugin } = createCanvasCorePlugin(false);
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(plugin);
    vi.mocked(app.vault.getFiles).mockReturnValue(castTo<TFile[]>([mockCanvasFile1, mockCanvasFile2]));

    component.load();

    instanceProto.onUserDisable();

    expect(app.metadataCache.deletePath).toHaveBeenCalledTimes(1);
    expect(app.metadataCache.deletePath).toHaveBeenCalledWith('a.canvas');
  });

  it('should reload backlinks view on cleanup', () => {
    const { app, component } = createComponent();
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(createCanvasCorePlugin(false).plugin);

    component.load();
    component.unload();

    expect(reloadBacklinksView).toHaveBeenCalled();
  });

  it('should handle onUserEnable patch', () => {
    const { app, component } = createComponent();
    const { instanceProto, plugin } = createCanvasCorePlugin(false);
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(plugin);

    component.load();

    instanceProto.onUserEnable();

    expect(loop).toHaveBeenCalled();
  });

  it('should handle onUserDisable patch', () => {
    const { app, component } = createComponent();
    const { instanceProto, plugin } = createCanvasCorePlugin(false);
    vi.mocked(app.internalPlugins.getPluginById).mockReturnValue(plugin);

    component.load();

    instanceProto.onUserDisable();

    expect(reloadBacklinksView).toHaveBeenCalled();
  });

  it('should return cached metadata for canvas files via getCache patch', () => {
    const { app, component } = createComponent();
    const originalGetCache = vi.mocked(app.metadataCache.getCache);
    originalGetCache.mockReturnValue(castTo<CachedMetadata>({ sections: [] }));

    component.load();

    vi.mocked(isCanvasFile).mockReturnValue(false);
    const nonCanvasResult = app.metadataCache.getCache('test.md');
    expect(originalGetCache).toHaveBeenCalled();
    expect(nonCanvasResult).toEqual({ sections: [] });

    vi.mocked(isCanvasFile).mockReturnValue(true);
    const result = app.metadataCache.getCache('uncached.canvas');
    expect(result).toBeNull();
  });
});

describe('CanvasComponent.initCanvasMetadataCache', () => {
  interface CreateCanvasAppOptions {
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
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(0))
      }
    });
  }

  function createComponentForApp(app: App): CanvasComponent {
    return createComponent({ app }).component;
  }

  function fileReference(link: string, nodeIndex = 0): CanvasReference {
    return {
      isCanvas: true,
      key: `nodes.${String(nodeIndex)}.file`,
      link,
      nodeIndex,
      original: link,
      type: 'file'
    };
  }

  it('should skip non-canvas files', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(false);

    const app = strictProxy<App>({});
    const component = createComponentForApp(app);
    const file = strictProxy<TFile>({ path: 'test.md' });

    await castTo<CanvasInternals>(component).initCanvasMetadataCache(file);
    expect(isCanvasFile).toHaveBeenCalled();
    expect(getCanvasReferences).not.toHaveBeenCalled();
  });

  it('should save an empty cache when the canvas has no references', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    vi.mocked(getCanvasReferences).mockResolvedValue([]);

    const app = createCanvasApp();
    const component = createComponentForApp(app);

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await castTo<CanvasInternals>(component).initCanvasMetadataCache(file);

    expect(getCanvasReferences).toHaveBeenCalledWith(app, file);
    expect(app.metadataCache.saveFileCache).toHaveBeenCalled();
    expect(app.metadataCache.saveMetaCache).toHaveBeenCalled();
  });

  it('should index a file-node reference (unresolved)', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    vi.mocked(getCanvasReferences).mockResolvedValue([fileReference('target.md')]);

    const app = createCanvasApp();
    const component = createComponentForApp(app);

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await castTo<CanvasInternals>(component).initCanvasMetadataCache(file);

    expect(app.metadataCache.saveFileCache).toHaveBeenCalled();
    expect(app.metadataCache.saveMetaCache).toHaveBeenCalled();
    expect(app.metadataCache.unresolvedLinks['test.canvas']?.['target.md']).toBe(1);
  });

  it('should index a text-node reference (resolved)', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    const textReference: CanvasTextNodeReference = {
      isCanvas: true,
      key: 'nodes.0.text.0',
      link: 'target',
      nodeIndex: 0,
      original: '[[target]]',
      originalReference: castTo<Reference>({ link: 'target', original: '[[target]]' }),
      type: 'text'
    };
    vi.mocked(getCanvasReferences).mockResolvedValue([textReference]);

    const app = createCanvasApp({
      getFirstLinkpathDest: vi.fn().mockReturnValue(strictProxy<TFile>({ path: 'target.md' }))
    });
    const component = createComponentForApp(app);

    const file = strictProxy<TFile>({
      path: 'test.canvas',
      stat: { ctime: 0, mtime: 100, size: 50 }
    });

    await castTo<CanvasInternals>(component).initCanvasMetadataCache(file);

    expect(app.metadataCache.saveMetaCache).toHaveBeenCalled();
    expect(app.metadataCache.resolvedLinks['test.canvas']?.['target']).toBe(1);
  });

  it('should track resolved links', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    vi.mocked(getCanvasReferences).mockResolvedValue([fileReference('target.md')]);

    const app = createCanvasApp({
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

  it('should handle multiple references to the same canvas (existing linksCache entry)', async () => {
    vi.mocked(isCanvasFile).mockReturnValue(true);
    vi.mocked(getCanvasReferences).mockResolvedValue([
      fileReference('target1.md', 0),
      fileReference('target2.md', 1)
    ]);

    const app = createCanvasApp();
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
});
