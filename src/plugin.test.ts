/* eslint-disable @typescript-eslint/no-extraneous-class -- Test mocks of the plugin's own sibling modules need constructor-only classes. */
import type {
  App as AppOriginal,
  PluginManifest
} from 'obsidian';

import { Component } from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

// --- Mocks for the plugin's OWN sibling modules (allowed: not obsidian-dev-utils / obsidian-test-mocks) ---

const hoisted = vi.hoisted(() => ({
  backlinkCacheComponentConstructor: vi.fn(),
  pluginSettingsComponentConstructor: vi.fn(),
  pluginSettingsTabConstructor: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/data-handler', () => ({
  PluginDataHandler: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-event-source', () => ({
  PluginEventSourceImpl: vi.fn()
}));

vi.mock('./plugin-settings-component.ts', () => ({
  // Extends the real obsidian-test-mocks Component so the real addChild lifecycle can load it.
  PluginSettingsComponent: class extends Component {
    public constructor(params: unknown) {
      super();
      hoisted.pluginSettingsComponentConstructor(params);
    }
  }
}));

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: class {
    public constructor(params: unknown) {
      hoisted.pluginSettingsTabConstructor(params);
    }
  }
}));

vi.mock('./backlink-cache-component.ts', () => ({
  // Extends the real obsidian-test-mocks Component so the real addChild lifecycle can load it.
  BacklinkCacheComponent: class extends Component {
    public constructor(params: unknown) {
      super();
      hoisted.backlinkCacheComponentConstructor(params);
    }
  }
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from './plugin.ts';

interface SettingTabsHolder {
  settingTabs__: unknown[];
}

function createApp(): AppOriginal {
  const appMock = App.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
    callback();
  });
  return appMock.asOriginalType__();
}

async function createLoadedPlugin(app: AppOriginal): Promise<Plugin> {
  const plugin = new Plugin(app, createManifest());
  await plugin.onload();
  return plugin;
}

function createManifest(): PluginManifest {
  return strictProxy<PluginManifest>({
    id: 'backlink-cache',
    name: 'Backlink Cache',
    version: '1.0.0'
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Plugin', () => {
  it('should create a plugin instance', async () => {
    const plugin = await createLoadedPlugin(createApp());
    expect(plugin).toBeInstanceOf(Plugin);
  });

  it('should wire up all components in onloadImpl', async () => {
    await createLoadedPlugin(createApp());
    expect(hoisted.pluginSettingsComponentConstructor).toHaveBeenCalledOnce();
    expect(hoisted.pluginSettingsTabConstructor).toHaveBeenCalledOnce();
    expect(hoisted.backlinkCacheComponentConstructor).toHaveBeenCalledOnce();
  });

  it('should add the plugin settings tab via its child component', async () => {
    const plugin = await createLoadedPlugin(createApp());
    expect(castTo<SettingTabsHolder>(plugin).settingTabs__).toHaveLength(1);
  });

  it('should register the refresh backlink panels command via its command handler', async () => {
    const plugin = new Plugin(createApp(), createManifest());
    const addCommandSpy = vi.spyOn(plugin, 'addCommand');
    await plugin.onload();
    expect(addCommandSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'refresh-backlink-panels' }));
  });

  it('should register the open demo vault command via its command handler', async () => {
    const plugin = new Plugin(createApp(), createManifest());
    const addCommandSpy = vi.spyOn(plugin, 'addCommand');
    await plugin.onload();
    expect(addCommandSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'open-demo-vault' }));
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class -- End of test file. */
