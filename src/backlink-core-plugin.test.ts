import type { BacklinkComponent } from '@obsidian-typings/obsidian-public-latest/implementations';
import type {
  App,
  Reference,
  TFile,
  WorkspaceLeaf
} from 'obsidian';
import type { CanvasData } from 'obsidian/canvas.d.ts';

import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
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

vi.mock('obsidian-dev-utils/obsidian/frontmatter-link-cache-with-offsets', () => ({
  isFrontmatterLinkCacheWithOffsets: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/metadata-cache', () => ({
  getBacklinksForFileSafe: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/reference', () => ({
  isCanvasFileNodeReference: vi.fn(),
  isCanvasReference: vi.fn(),
  isCanvasTextNodeReference: vi.fn(),
  sortReferences: vi.fn()
}));

vi.mock('@obsidian-typings/obsidian-public-latest/implementations', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    isFrontmatterLinkCache: vi.fn(),
    isReferenceCache: vi.fn()
  };
});

vi.mock('./file-comparer.ts', () => ({
  getFileComparer: vi.fn(() => () => 0)
}));

const { isCanvasFile } = await import('obsidian-dev-utils/obsidian/file-system');
const { isFrontmatterLinkCacheWithOffsets } = await import('obsidian-dev-utils/obsidian/frontmatter-link-cache-with-offsets');
const { getBacklinksForFileSafe } = await import('obsidian-dev-utils/obsidian/metadata-cache');
const { isCanvasFileNodeReference, isCanvasReference, isCanvasTextNodeReference } = await import('obsidian-dev-utils/obsidian/reference');
const { isFrontmatterLinkCache, isReferenceCache } = await import('@obsidian-typings/obsidian-public-latest/implementations');

const { patchBacklinksCorePlugin, reloadBacklinksView } = await import('./backlink-core-plugin.ts');

beforeEach(() => {
  registeredPatches.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reloadBacklinksView', () => {
  it('should return early when there is no backlinks leaf', async () => {
    const app = strictProxy<App>({
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([])
      }
    });

    await reloadBacklinksView(app);
  });

  it('should reload backlinks view when backlink view has a file', async () => {
    const recomputeBacklink = vi.fn();
    const backlinksLeaf = {
      loadIfDeferred: vi.fn().mockResolvedValue(undefined),
      view: {
        backlink: { recomputeBacklink },
        file: strictProxy<TFile>({ path: 'test.md' })
      }
    } as unknown as WorkspaceLeaf;

    const app = strictProxy<App>({
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([backlinksLeaf])
      }
    });

    await reloadBacklinksView(app);
    expect(recomputeBacklink).toHaveBeenCalledOnce();
  });

  it('should not recompute when backlink view has no file', async () => {
    const recomputeBacklink = vi.fn();
    const backlinksLeaf = {
      loadIfDeferred: vi.fn().mockResolvedValue(undefined),
      view: {
        backlink: { recomputeBacklink },
        file: null
      }
    } as unknown as WorkspaceLeaf;

    const app = strictProxy<App>({
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([backlinksLeaf])
      }
    });

    await reloadBacklinksView(app);
    expect(recomputeBacklink).not.toHaveBeenCalled();
  });
});

describe('patchBacklinksCorePlugin', () => {
  it('should return early when backlinks core plugin does not exist', () => {
    const plugin = strictProxy<Plugin>({
      app: {
        internalPlugins: {
          getPluginById: vi.fn().mockReturnValue(null)
        }
      }
    });

    patchBacklinksCorePlugin(plugin);
    expect(registeredPatches.length).toBe(0);
  });

  it('should register onUserEnable patch when plugin exists but is disabled', () => {
    const backlinksCorePlugin = {
      enabled: false,
      instance: Object.create({ onUserEnable: vi.fn() }) as object
    };

    const plugin = strictProxy<Plugin>({
      addChild: vi.fn().mockImplementation((child: unknown) => child),
      app: {
        internalPlugins: {
          getPluginById: vi.fn().mockReturnValue(backlinksCorePlugin)
        },
        workspace: {
          getLeavesOfType: vi.fn().mockReturnValue([])
        }
      }
    });

    patchBacklinksCorePlugin(plugin);

    expect(registeredPatches.length).toBe(1);
    expect(registeredPatches[0]?.patches['onUserEnable']).toBeDefined();
  });

  it('should call onBacklinksCorePluginEnable when plugin is already enabled', async () => {
    const backlinksCorePlugin = {
      enabled: true,
      instance: Object.create({ onUserEnable: vi.fn() }) as object
    };

    const backlinksLeaf = {
      loadIfDeferred: vi.fn().mockResolvedValue(undefined),
      view: {
        backlink: Object.assign(Object.create({ recomputeBacklink: vi.fn() }) as object, {}) as object,
        file: null
      }
    } as unknown as WorkspaceLeaf;

    const plugin = strictProxy<Plugin>({
      addChild: vi.fn().mockImplementation((child: unknown) => child),
      app: {
        internalPlugins: {
          getPluginById: vi.fn().mockReturnValue(backlinksCorePlugin)
        },
        workspace: {
          getLeavesOfType: vi.fn().mockReturnValue([backlinksLeaf])
        }
      }
    });

    patchBacklinksCorePlugin(plugin);

    // Wait for async patchBacklinksPane
    await vi.waitFor(() => {
      expect(registeredPatches.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('should invoke next in patched onUserEnable', () => {
    const nextFn = vi.fn();
    const backlinksCorePlugin = {
      enabled: false,
      instance: Object.create({ onUserEnable: vi.fn() }) as object
    };

    const plugin = strictProxy<Plugin>({
      addChild: vi.fn().mockImplementation((child: unknown) => child),
      app: {
        internalPlugins: {
          getPluginById: vi.fn().mockReturnValue(backlinksCorePlugin)
        },
        workspace: {
          getLeavesOfType: vi.fn().mockReturnValue([])
        }
      }
    });

    patchBacklinksCorePlugin(plugin);

    const patchFactory = registeredPatches[0]?.patches['onUserEnable'];
    expect(patchFactory).toBeDefined();

    const patchedFn = patchFactory?.(nextFn);
    patchedFn?.call(backlinksCorePlugin.instance);

    expect(nextFn).toHaveBeenCalled();
  });
});

describe('recomputeBacklinkAsync (via patched recomputeBacklink)', () => {
  function createBacklinkComponent(overrides: Partial<BacklinkComponent> = {}): BacklinkComponent {
    return {
      app: {
        vault: {
          getFileByPath: vi.fn().mockReturnValue(null),
          read: vi.fn().mockResolvedValue('')
        }
      },
      backlinkCollapsed: false,
      backlinkCountEl: {
        hide: vi.fn(),
        setText: vi.fn(),
        show: vi.fn()
      },
      backlinkDom: {
        addResult: vi.fn().mockReturnValue({ renderContentMatches: vi.fn() }),
        changed: vi.fn(),
        emptyResults: vi.fn(),
        getMatchCount: vi.fn().mockReturnValue(0),
        sortOrder: 'alphabetical'
      },
      backlinkFile: null,
      passSearchFilter: vi.fn().mockReturnValue(true),
      stopBacklinkSearch: vi.fn(),
      ...overrides
    } as unknown as BacklinkComponent;
  }

  async function setupPatchedRecomputeBacklink(): Promise<(component: BacklinkComponent, file: null | TFile) => Promise<void>> {
    const backlinksCorePlugin = {
      enabled: true,
      instance: Object.create({ onUserEnable: vi.fn() }) as object
    };

    const backlinkPrototype = { recomputeBacklink: vi.fn() };
    const backlinksLeaf = {
      loadIfDeferred: vi.fn().mockResolvedValue(undefined),
      view: {
        backlink: Object.assign(Object.create(backlinkPrototype) as object, {}) as object,
        file: null
      }
    } as unknown as WorkspaceLeaf;

    const plugin = strictProxy<Plugin>({
      addChild: vi.fn().mockImplementation((child: unknown) => child),
      app: {
        internalPlugins: {
          getPluginById: vi.fn().mockReturnValue(backlinksCorePlugin)
        },
        workspace: {
          getLeavesOfType: vi.fn().mockReturnValue([backlinksLeaf])
        }
      }
    });

    patchBacklinksCorePlugin(plugin);

    let recomputePatch: PatchFactory | undefined;
    await vi.waitFor(() => {
      recomputePatch = registeredPatches.find((p) => !!p.patches['recomputeBacklink'])?.patches['recomputeBacklink'];
      expect(recomputePatch).toBeDefined();
    });

    const patchedFn = recomputePatch?.(vi.fn());

    return async (component: BacklinkComponent, file: null | TFile): Promise<void> => {
      await patchedFn?.call(component, file);
    };
  }

  it('should hide count and return when collapsed', async () => {
    const component = createBacklinkComponent({ backlinkCollapsed: true });
    const recompute = await setupPatchedRecomputeBacklink();

    await recompute(component, null);

    expect(component.backlinkCountEl.hide).toHaveBeenCalled();
    expect(component.stopBacklinkSearch).toHaveBeenCalled();
  });

  it('should empty results and return when no file', async () => {
    const component = createBacklinkComponent();
    const recompute = await setupPatchedRecomputeBacklink();

    await recompute(component, null);

    expect(component.backlinkDom.emptyResults).toHaveBeenCalled();
    expect(component.backlinkCountEl.setText).toHaveBeenCalledWith('0');
  });

  it('should process backlinks with reference cache links', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'note.md' });
    const component = createBacklinkComponent();

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);

    const link: Reference = {
      position: {
        end: { col: 10, line: 0, offset: 20 },
        start: { col: 0, line: 0, offset: 0 }
      }
    } as unknown as Reference;

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: (key: string) => (key === 'note.md' ? [link] : []),
      keys: () => ['note.md']
    } as never);
    vi.mocked(isReferenceCache).mockReturnValue(true);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCache).mockReturnValue(false);
    vi.mocked(isCanvasFile).mockReturnValue(false);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(component.backlinkDom.addResult).toHaveBeenCalled();
  });

  it('should process frontmatter link cache with offsets', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'note.md' });
    const component = createBacklinkComponent();

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);

    const link = { endOffset: 30, key: 'aliases.0.name', link: 'target', original: 'target', startOffset: 10 };

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => [link],
      keys: () => ['note.md']
    } as never);
    vi.mocked(isReferenceCache).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(true);
    vi.mocked(isFrontmatterLinkCache).mockReturnValue(false);
    vi.mocked(isCanvasFile).mockReturnValue(false);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(component.backlinkDom.addResult).toHaveBeenCalled();
  });

  it('should process frontmatter link cache without offsets', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'note.md' });
    const component = createBacklinkComponent();

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);

    const link = { key: 'related.0.notes', link: 'target', original: 'target' };

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => [link],
      keys: () => ['note.md']
    } as never);
    vi.mocked(isReferenceCache).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCache).mockReturnValue(true);
    vi.mocked(isCanvasFile).mockReturnValue(false);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(component.backlinkDom.addResult).toHaveBeenCalled();
  });

  it('should skip files that fail search filter', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'note.md' });
    const component = createBacklinkComponent();

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);
    vi.mocked(component.passSearchFilter).mockReturnValue(false);

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => [{ link: 'target', original: 'target' }],
      keys: () => ['note.md']
    } as never);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(component.backlinkDom.addResult).not.toHaveBeenCalled();
  });

  it('should handle canvas file node backlinks', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'canvas.canvas' });
    const component = createBacklinkComponent();

    const canvasData: CanvasData = {
      edges: [],
      nodes: [{ file: 'target.md', height: 100, id: 'node1', type: 'file', width: 100, x: 0, y: 0 }]
    };

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);
    vi.mocked(component.app.vault.read).mockResolvedValue(JSON.stringify(canvasData));

    const link = { isCanvas: true, key: 'nodes.0.file', link: 'target.md', nodeIndex: 0, original: 'target.md', type: 'file' };

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    } as never);
    vi.mocked(isReferenceCache).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCache).mockReturnValue(true);
    vi.mocked(isCanvasFile).mockReturnValue(true);
    vi.mocked(isCanvasReference).mockReturnValue(true);
    vi.mocked(isCanvasFileNodeReference).mockReturnValue(true);
    vi.mocked(isCanvasTextNodeReference).mockReturnValue(false);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(component.backlinkDom.addResult).toHaveBeenCalled();
  });

  it('should handle canvas text node with reference positions', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'canvas.canvas' });
    const component = createBacklinkComponent();

    const canvasData: CanvasData = {
      edges: [],
      nodes: [{ height: 100, id: 'node1', text: '[[target]]', type: 'text', width: 100, x: 0, y: 0 }]
    };

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);
    vi.mocked(component.app.vault.read).mockResolvedValue(JSON.stringify(canvasData));

    const originalReference = {
      link: 'target',
      original: '[[target]]',
      position: { end: { col: 10, line: 0, offset: 10 }, start: { col: 0, line: 0, offset: 0 } }
    };
    const link = { isCanvas: true, key: 'nodes.0.text.0', link: 'target', nodeIndex: 0, original: '[[target]]', originalReference, type: 'text' };

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    } as never);
    vi.mocked(isReferenceCache).mockImplementation((ref: unknown) => ref === originalReference);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCache).mockImplementation((ref: unknown) => ref === link);
    vi.mocked(isCanvasFile).mockReturnValue(true);
    vi.mocked(isCanvasReference).mockReturnValue(true);
    vi.mocked(isCanvasFileNodeReference).mockReturnValue(false);
    vi.mocked(isCanvasTextNodeReference).mockReturnValue(true);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(component.backlinkDom.addResult).toHaveBeenCalled();
  });

  it('should handle canvas text node using indexOf fallback', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'canvas.canvas' });
    const component = createBacklinkComponent();

    const canvasData: CanvasData = {
      edges: [],
      nodes: [{ height: 100, id: 'node1', text: '[[target]]', type: 'text', width: 100, x: 0, y: 0 }]
    };

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);
    vi.mocked(component.app.vault.read).mockResolvedValue(JSON.stringify(canvasData));

    const originalReference = { key: 'test', link: 'target', original: '[[target]]' };
    const link = { isCanvas: true, key: 'nodes.0.text.0', link: 'target', nodeIndex: 0, original: '[[target]]', originalReference, type: 'text' };

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    } as never);
    vi.mocked(isReferenceCache).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCache).mockReturnValue(true);
    vi.mocked(isCanvasFile).mockReturnValue(true);
    vi.mocked(isCanvasReference).mockReturnValue(true);
    vi.mocked(isCanvasFileNodeReference).mockReturnValue(false);
    vi.mocked(isCanvasTextNodeReference).mockReturnValue(true);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(component.backlinkDom.addResult).toHaveBeenCalled();
  });

  it('should warn for non-canvas reference on canvas file', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'canvas.canvas' });
    const component = createBacklinkComponent();

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);
    vi.mocked(component.app.vault.read).mockResolvedValue(JSON.stringify({ edges: [], nodes: [] }));

    const link = { key: 'test', link: 'target', original: 'target' };

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    } as never);
    vi.mocked(isReferenceCache).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCache).mockReturnValue(true);
    vi.mocked(isCanvasFile).mockReturnValue(true);
    vi.mocked(isCanvasReference).mockReturnValue(false);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(warnSpy).toHaveBeenCalledWith('Unknown link type', { link });
  });

  it('should warn when canvas node not found', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'canvas.canvas' });
    const component = createBacklinkComponent();

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);
    vi.mocked(component.app.vault.read).mockResolvedValue(JSON.stringify({ edges: [], nodes: [] }));

    const link = { isCanvas: true, key: 'nodes.99.file', link: 'target', nodeIndex: 99, original: 'target', type: 'file' };

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    } as never);
    vi.mocked(isReferenceCache).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCache).mockReturnValue(true);
    vi.mocked(isCanvasFile).mockReturnValue(true);
    vi.mocked(isCanvasReference).mockReturnValue(true);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(warnSpy).toHaveBeenCalledWith('Node not found', { link });
  });

  it('should warn when canvas file node file is not a string', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'canvas.canvas' });
    const component = createBacklinkComponent();

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);
    vi.mocked(component.app.vault.read).mockResolvedValue(JSON.stringify({
      edges: [],
      nodes: [{ file: 123, height: 100, id: 'n1', type: 'file', width: 100, x: 0, y: 0 }]
    }));

    const link = { isCanvas: true, key: 'nodes.0.file', link: 'target', nodeIndex: 0, original: 'target', type: 'file' };

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    } as never);
    vi.mocked(isReferenceCache).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCache).mockReturnValue(true);
    vi.mocked(isCanvasFile).mockReturnValue(true);
    vi.mocked(isCanvasReference).mockReturnValue(true);
    vi.mocked(isCanvasFileNodeReference).mockReturnValue(true);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(warnSpy).toHaveBeenCalledWith('Node file is not a string', expect.objectContaining({ link }));
  });

  it('should warn when canvas text node text is not a string', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'canvas.canvas' });
    const component = createBacklinkComponent();

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);
    vi.mocked(component.app.vault.read).mockResolvedValue(JSON.stringify({
      edges: [],
      nodes: [{ height: 100, id: 'n1', text: 123, type: 'text', width: 100, x: 0, y: 0 }]
    }));

    const link = {
      isCanvas: true,
      key: 'nodes.0.text.0',
      link: 'target',
      nodeIndex: 0,
      original: 'target',
      originalReference: { link: 'target', original: 'target' },
      type: 'text'
    };

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    } as never);
    vi.mocked(isReferenceCache).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCache).mockReturnValue(true);
    vi.mocked(isCanvasFile).mockReturnValue(true);
    vi.mocked(isCanvasReference).mockReturnValue(true);
    vi.mocked(isCanvasFileNodeReference).mockReturnValue(false);
    vi.mocked(isCanvasTextNodeReference).mockReturnValue(true);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(warnSpy).toHaveBeenCalledWith('Node text is not a string', expect.objectContaining({ link }));
  });

  it('should warn for unknown canvas link subtype', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'canvas.canvas' });
    const component = createBacklinkComponent();

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);
    vi.mocked(component.app.vault.read).mockResolvedValue(JSON.stringify({
      edges: [],
      nodes: [{ height: 100, id: 'n1', text: 'hello', type: 'text', width: 100, x: 0, y: 0 }]
    }));

    const link = { isCanvas: true, key: 'nodes.0.something', link: 'target', nodeIndex: 0, original: 'target', type: 'unknown' };

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    } as never);
    vi.mocked(isReferenceCache).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCache).mockReturnValue(true);
    vi.mocked(isCanvasFile).mockReturnValue(true);
    vi.mocked(isCanvasReference).mockReturnValue(true);
    vi.mocked(isCanvasFileNodeReference).mockReturnValue(false);
    vi.mocked(isCanvasTextNodeReference).mockReturnValue(false);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(warnSpy).toHaveBeenCalledWith('Unknown link type', { link });
  });

  it('should handle null from backlinks.get()', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'note.md' });
    const component = createBacklinkComponent();

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => null,
      keys: () => ['note.md']
    } as never);
    vi.mocked(isCanvasFile).mockReturnValue(false);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    // With empty links array (from ?? []), no addResult should be called
    expect(component.backlinkDom.addResult).not.toHaveBeenCalled();
  });

  it('should handle link that matches none of the type checks', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'note.md' });
    const component = createBacklinkComponent();

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);

    const link = { key: 'test', link: 'target', original: 'target' };

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => [link],
      keys: () => ['note.md']
    } as never);
    vi.mocked(isReferenceCache).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCache).mockReturnValue(false);
    vi.mocked(isCanvasFile).mockReturnValue(false);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    // isValidLink never becomes true, so addResult should not be called
    expect(component.backlinkDom.addResult).not.toHaveBeenCalled();
  });

  it('should reuse existing canvasNodeMatches for same node', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'canvas.canvas' });
    const component = createBacklinkComponent();

    const canvasData: CanvasData = {
      edges: [],
      nodes: [{ file: 'target.md', height: 100, id: 'node1', type: 'file', width: 100, x: 0, y: 0 }]
    };

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);
    vi.mocked(component.app.vault.read).mockResolvedValue(JSON.stringify(canvasData));

    const link1 = { isCanvas: true, key: 'nodes.0.file', link: 'target.md', nodeIndex: 0, original: 'target.md', type: 'file' };
    const link2 = { isCanvas: true, key: 'nodes.0.file', link: 'target.md', nodeIndex: 0, original: 'target.md', type: 'file' };

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 2,
      get: () => [link1, link2],
      keys: () => ['canvas.canvas']
    } as never);
    vi.mocked(isReferenceCache).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCache).mockReturnValue(true);
    vi.mocked(isCanvasFile).mockReturnValue(true);
    vi.mocked(isCanvasReference).mockReturnValue(true);
    vi.mocked(isCanvasFileNodeReference).mockReturnValue(true);
    vi.mocked(isCanvasTextNodeReference).mockReturnValue(false);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(component.backlinkDom.addResult).toHaveBeenCalled();
  });

  it('should filter out null files from backlinks keys', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const component = createBacklinkComponent();

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(null);

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue({
      count: () => 1,
      get: () => [],
      keys: () => ['nonexistent.md']
    } as never);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(component.backlinkDom.addResult).not.toHaveBeenCalled();
  });
});
