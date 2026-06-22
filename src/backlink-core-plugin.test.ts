import type {
  BacklinkView,
  CustomArrayDict
} from '@obsidian-typings/obsidian-public-latest';
// eslint-disable-next-line import-x/no-namespace -- Type-only namespace alias used for vitest's importOriginal<T>() without dynamic import() in type position.
import type * as ObsidianImplementationsModule from '@obsidian-typings/obsidian-public-latest/implementations';
import type { BacklinkComponent } from '@obsidian-typings/obsidian-public-latest/implementations';
import type {
  App,
  Reference,
  ReferenceCache,
  TFile,
  WorkspaceLeaf
} from 'obsidian';
import type { CanvasData } from 'obsidian/canvas.d.ts';

import {
  InternalPluginName,
  isFrontmatterLinkCache,
  isReferenceCache
} from '@obsidian-typings/obsidian-public-latest/implementations';
import { debounce } from 'obsidian';
import { sleep } from 'obsidian-dev-utils/async';
import { isCanvasFile } from 'obsidian-dev-utils/obsidian/file-system';
import { isFrontmatterLinkCacheWithOffsets } from 'obsidian-dev-utils/obsidian/frontmatter-link-cache-with-offsets';
import { getBacklinksForFileSafe } from 'obsidian-dev-utils/obsidian/metadata-cache';
import {
  isCanvasFileNodeReference,
  isCanvasReference,
  isCanvasTextNodeReference
} from 'obsidian-dev-utils/obsidian/reference';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  BacklinksCorePluginComponent,
  reloadBacklinksView
} from './backlink-core-plugin.ts';

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
  isCanvasTextNodeReference: vi.fn()
}));

vi.mock('@obsidian-typings/obsidian-public-latest/implementations', async (importOriginal) => {
  const original = await importOriginal<typeof ObsidianImplementationsModule>();
  return {
    ...original,
    isFrontmatterLinkCache: vi.fn(),
    isReferenceCache: vi.fn()
  };
});

vi.mock('./file-comparer.ts', () => ({
  getFileComparer: vi.fn((): () => number => () => 0)
}));

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
    expect(app.workspace.getLeavesOfType).toHaveBeenCalled();
  });

  it('should reload backlinks view when backlink view has a file', async () => {
    const recomputeBacklink = vi.fn();
    const backlinksLeaf = strictProxy<WorkspaceLeaf>({
      loadIfDeferred: vi.fn().mockResolvedValue(undefined),
      view: strictProxy<BacklinkView>({
        backlink: { recomputeBacklink },
        file: strictProxy<TFile>({ path: 'test.md' })
      })
    });

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
    const backlinksLeaf = strictProxy<WorkspaceLeaf>({
      loadIfDeferred: vi.fn().mockResolvedValue(undefined),
      view: strictProxy<BacklinkView>({
        backlink: { recomputeBacklink },
        file: null
      })
    });

    const app = strictProxy<App>({
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([backlinksLeaf])
      }
    });

    await reloadBacklinksView(app);
    expect(recomputeBacklink).not.toHaveBeenCalled();
  });
});

describe('BacklinksCorePluginComponent', () => {
  it('should return early when backlinks core plugin does not exist', () => {
    const app = strictProxy<App>({
      internalPlugins: {
        getPluginById: vi.fn().mockReturnValue(null)
      }
    });

    const component = new BacklinksCorePluginComponent(app);
    component.load();
    expect(app.internalPlugins.getPluginById).toHaveBeenCalledWith(InternalPluginName.Backlink);
  });

  it('should patch onUserEnable on the plugin instance when disabled', () => {
    const onUserEnable = vi.fn();
    const instanceProto = { onUserEnable };
    const backlinksCorePlugin = {
      enabled: false,
      instance: Object.create(instanceProto) as object
    };

    const app = strictProxy<App>({
      internalPlugins: {
        getPluginById: vi.fn().mockReturnValue(backlinksCorePlugin)
      },
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([])
      }
    });

    const component = new BacklinksCorePluginComponent(app);
    component.load();

    expect(instanceProto.onUserEnable).not.toBe(onUserEnable);
  });

  it('should patch backlinks pane when plugin is already enabled', async () => {
    const backlinksCorePlugin = {
      enabled: true,
      instance: Object.create({ onUserEnable: vi.fn() }) as object
    };

    const recomputeBacklink = vi.fn();
    const backlinkProto = { recomputeBacklink };
    const backlinksLeaf = strictProxy<WorkspaceLeaf>({
      loadIfDeferred: vi.fn().mockResolvedValue(undefined),
      view: strictProxy<BacklinkView>({
        backlink: Object.create(backlinkProto),
        file: null
      })
    });

    const app = strictProxy<App>({
      internalPlugins: {
        getPluginById: vi.fn().mockReturnValue(backlinksCorePlugin)
      },
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([backlinksLeaf])
      }
    });

    const component = new BacklinksCorePluginComponent(app);
    component.load();

    await vi.waitFor(() => {
      expect(backlinkProto.recomputeBacklink).not.toBe(recomputeBacklink);
    });
  });

  it('should invoke fallback and enable handler in patched onUserEnable', () => {
    const onUserEnable = vi.fn();
    const instanceProto = { onUserEnable };
    const backlinksCorePlugin = {
      enabled: false,
      instance: Object.create(instanceProto) as object
    };

    const app = strictProxy<App>({
      internalPlugins: {
        getPluginById: vi.fn().mockReturnValue(backlinksCorePlugin)
      },
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([])
      }
    });

    const component = new BacklinksCorePluginComponent(app);
    component.load();

    instanceProto.onUserEnable();

    expect(onUserEnable).toHaveBeenCalled();
  });
});

describe('recomputeBacklinkAsync (via patched recomputeBacklink)', () => {
  function createBacklinkComponent(overrides: Partial<BacklinkComponent> = {}): BacklinkComponent {
    return strictProxy<BacklinkComponent>({
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
        changed: debounce(vi.fn()),
        emptyResults: vi.fn(),
        getMatchCount: vi.fn().mockReturnValue(0),
        sortOrder: 'alphabetical'
      },
      backlinkFile: null,
      passSearchFilter: vi.fn().mockReturnValue(true),
      stopBacklinkSearch: vi.fn(),
      ...overrides
    });
  }

  async function setupPatchedRecomputeBacklink(): Promise<(component: BacklinkComponent, file: null | TFile) => Promise<void>> {
    const backlinksCorePlugin = {
      enabled: true,
      instance: Object.create({ onUserEnable: vi.fn() }) as object
    };

    const originalRecomputeBacklink = vi.fn();
    const backlinkProto = { recomputeBacklink: originalRecomputeBacklink };
    const backlinksLeaf = strictProxy<WorkspaceLeaf>({
      loadIfDeferred: vi.fn().mockResolvedValue(undefined),
      view: strictProxy<BacklinkView>({
        backlink: Object.create(backlinkProto),
        file: null
      })
    });

    const app = strictProxy<App>({
      internalPlugins: {
        getPluginById: vi.fn().mockReturnValue(backlinksCorePlugin)
      },
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([backlinksLeaf])
      }
    });

    const component = new BacklinksCorePluginComponent(app);
    component.load();

    await vi.waitFor(() => {
      expect(backlinkProto.recomputeBacklink).not.toBe(originalRecomputeBacklink);
    });

    return async (backlinkComponent: BacklinkComponent, file: null | TFile): Promise<void> => {
      backlinkProto.recomputeBacklink.call(backlinkComponent, file);
      // `recomputeBacklink` dispatches its work via the real `invokeAsyncSafely` as fire-and-forget;
      // Flush the microtask chain (mocked awaits resolve immediately) with a macrotask tick.
      await sleep(0);
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

    const link = strictProxy<ReferenceCache>({
      position: {
        end: { col: 10, line: 0, offset: 20 },
        start: { col: 0, line: 0, offset: 0 }
      }
    });

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: (key: string) => (key === 'note.md' ? [link] : []),
      keys: () => ['note.md']
    }));
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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => [link],
      keys: () => ['note.md']
    }));
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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => [link],
      keys: () => ['note.md']
    }));
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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => [{ link: 'target', original: 'target' }],
      keys: () => ['note.md']
    }));

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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    }));
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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    }));
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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    }));
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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    }));
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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    }));
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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    }));
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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    }));
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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => [link],
      keys: () => ['canvas.canvas']
    }));
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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => null,
      keys: () => ['note.md']
    }));
    vi.mocked(isCanvasFile).mockReturnValue(false);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(component.backlinkDom.addResult).not.toHaveBeenCalled();
  });

  it('should handle link that matches none of the type checks', async () => {
    const backlinkFile = strictProxy<TFile>({ path: 'target.md' });
    const backlinkNoteFile = strictProxy<TFile>({ path: 'note.md' });
    const component = createBacklinkComponent();

    vi.mocked(component.app.vault.getFileByPath).mockReturnValue(backlinkNoteFile);

    const link = { key: 'test', link: 'target', original: 'target' };

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => [link],
      keys: () => ['note.md']
    }));
    vi.mocked(isReferenceCache).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCacheWithOffsets).mockReturnValue(false);
    vi.mocked(isFrontmatterLinkCache).mockReturnValue(false);
    vi.mocked(isCanvasFile).mockReturnValue(false);

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 2,
      get: () => [link1, link2],
      keys: () => ['canvas.canvas']
    }));
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

    vi.mocked(getBacklinksForFileSafe).mockResolvedValue(strictProxy<CustomArrayDict<Reference>>({
      count: () => 1,
      get: () => [],
      keys: () => ['nonexistent.md']
    }));

    const recompute = await setupPatchedRecomputeBacklink();
    await recompute(component, backlinkFile);

    expect(component.backlinkDom.addResult).not.toHaveBeenCalled();
  });
});
