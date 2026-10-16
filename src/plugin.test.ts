/* eslint-disable @typescript-eslint/no-extraneous-class -- Test mocks of the plugin's own sibling modules need constructor-only classes. */
import type {
  App as AppOriginal,
  PluginManifest
} from 'obsidian';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { Component } from 'obsidian';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

interface ComponentModuleActual {
  Component: new () => object;
}

interface PluginSuggestionComponentParams {
  readonly isSuggestionDeclined: (this: void) => boolean;
  readonly reason: string;
  readonly setSuggestionDeclined: (this: void, isDeclined: boolean) => Promise<void>;
  readonly suggestedPluginId: string;
  readonly suggestedPluginName: string;
}

interface SuggestionSettings {
  isAdvancedMetadataCacheSuggestionDeclined: boolean;
}

// Capture the `PluginSuggestionComponent` constructor argument so the closures the plugin hands it — the
// declined-flag getter and setter — can be invoked directly. The stub returns a fresh real `Component` so
// the real `PluginBase` lifecycle can load it as a child without reaching the community-plugin registry.
const { pluginSuggestionStub } = vi.hoisted(() => ({
  pluginSuggestionStub: vi.fn<(params: PluginSuggestionComponentParams) => object>()
}));

vi.mock('@mnaoumov/obsidian-lib/components/plugin-suggestion-component', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mnaoumov/obsidian-lib/components/plugin-suggestion-component')>();
  const { Component: ComponentActual } = await vi.importActual<ComponentModuleActual>('obsidian');
  // eslint-disable-next-line prefer-arrow-callback -- a vi.fn used with `new` must be a non-arrow function returning a fresh real Component.
  pluginSuggestionStub.mockImplementation(function NamedStub() {
    return new ComponentActual();
  });
  return {
    ...actual,
    PluginSuggestionComponent: pluginSuggestionStub
  };
});

// --- Mocks for the plugin's OWN sibling modules (allowed: not @mnaoumov/obsidian-lib / obsidian-test-mocks) ---

const hoisted = vi.hoisted(() => ({
  pluginSettingsComponentConstructor: vi.fn(),
  pluginSettingsTabConstructor: vi.fn(),
  successorEnabledComponentConstructor: vi.fn()
}));

// `PluginDataHandler` and `PluginEventSourceImpl` are NOT stubbed: the `@mnaoumov/obsidian-lib` base
// builds its own settings component out of them during `onload`, and that component really calls
// `pluginEventSource.on`, so a bare `vi.fn()` double makes the base throw before `onloadImpl` runs.
vi.mock('./plugin-settings-component.ts', () => ({
  // Extends the real obsidian-test-mocks Component so the real addChild lifecycle can load it.
  PluginSettingsComponent: class extends Component {
    public settings: SuggestionSettings = { isAdvancedMetadataCacheSuggestionDeclined: false };

    public constructor(params: unknown) {
      super();
      hoisted.pluginSettingsComponentConstructor(params);
    }

    public editAndSave(editor: (settings: SuggestionSettings) => void): Promise<void> {
      editor(this.settings);
      return noopAsync();
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

vi.mock('./successor-enabled-component.ts', () => ({
  // Extends the real obsidian-test-mocks Component so the real addChild lifecycle can load it.
  SuccessorEnabledComponent: class extends Component {
    public constructor(params: unknown) {
      super();
      hoisted.successorEnabledComponentConstructor(params);
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
    expect(hoisted.successorEnabledComponentConstructor).toHaveBeenCalledOnce();
  });

  it('should add the plugin settings tab via its child component', async () => {
    const plugin = await createLoadedPlugin(createApp());
    expect(castTo<SettingTabsHolder>(plugin).settingTabs__).toHaveLength(1);
  });

  it('should register none of its former commands, since pointing to its successor is its only job', async () => {
    const plugin = new Plugin(createApp(), createManifest());
    const addCommandSpy = vi.spyOn(plugin, 'addCommand');
    await plugin.onload();
    // The base plugin may still register commands of its own, so only this plugin's former ones are asserted.
    const commandIds = addCommandSpy.mock.calls.map(([command]) => command.id);
    expect(commandIds).not.toContain('refresh-backlink-panels');
    expect(commandIds).not.toContain('open-demo-vault');
  });

  it('should ask to be removed once Advanced Metadata Cache is enabled', async () => {
    await createLoadedPlugin(createApp());
    expect(hoisted.successorEnabledComponentConstructor).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'backlink-cache',
      pluginName: 'Backlink Cache',
      successorPluginId: 'advanced-metadata-cache',
      successorPluginName: 'Advanced Metadata Cache'
    }));
  });

  it('should hand the successor-enabled component to the settings tab', async () => {
    await createLoadedPlugin(createApp());
    expect(hoisted.pluginSettingsTabConstructor).toHaveBeenCalledWith(expect.objectContaining({
      successorEnabledComponent: expect.any(Component) as unknown
    }));
  });

  it('should suggest Advanced Metadata Cache as its successor', async () => {
    await createLoadedPlugin(createApp());
    expect(pluginSuggestionStub).toHaveBeenCalledOnce();
    expect(suggestionParams().suggestedPluginId).toBe('advanced-metadata-cache');
    expect(suggestionParams().suggestedPluginName).toBe('Advanced Metadata Cache');
    expect(suggestionParams().reason).toContain('Advanced Metadata Cache replaced it');
  });

  it('should hand the suggestion component to the settings tab', async () => {
    await createLoadedPlugin(createApp());
    expect(hoisted.pluginSettingsTabConstructor).toHaveBeenCalledWith(expect.objectContaining({
      pluginSuggestionComponent: castTo<object>(ensureNonNullable(pluginSuggestionStub.mock.results[0]).value)
    }));
  });

  it('should report the suggestion as not declined until the user says otherwise', async () => {
    await createLoadedPlugin(createApp());
    expect(suggestionParams().isSuggestionDeclined()).toBe(false);
  });

  it('should remember a declined suggestion in its own settings', async () => {
    await createLoadedPlugin(createApp());
    const params = suggestionParams();
    await params.setSuggestionDeclined(true);
    expect(params.isSuggestionDeclined()).toBe(true);
  });
});

function suggestionParams(): PluginSuggestionComponentParams {
  return ensureNonNullable(pluginSuggestionStub.mock.calls[0])[0];
}
/* eslint-enable @typescript-eslint/no-extraneous-class -- End of test file. */
