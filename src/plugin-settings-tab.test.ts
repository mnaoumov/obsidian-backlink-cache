import type { PluginSettingsComponentBase } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';
import type { PluginSuggestionComponent } from '@mnaoumov/obsidian-lib/components/plugin-suggestion-component';
import type {
  App as AppOriginal,
  Plugin,
  SettingGroup
} from 'obsidian';

import { SettingEx } from '@mnaoumov/obsidian-lib/setting-ex';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { SuccessorEnabledComponent } from './successor-enabled-component.ts';

import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { PluginSettings } from './plugin-settings.ts';

interface SearchableDefinition {
  searchable?: boolean;
}

interface VisibleDefinition {
  visible: () => boolean;
}

const SUGGESTION_ROW_INDEX = 0;
const SUCCESSOR_ENABLED_ROW_INDEX = 1;

let app: AppOriginal;
let isSuccessorEnabled: ReturnType<typeof vi.fn<() => boolean>>;
let renderSuggestionBanner: ReturnType<typeof vi.fn<(containerEl: HTMLElement) => void>>;
let renderSuccessorEnabledBanner: ReturnType<typeof vi.fn<(containerEl: HTMLElement) => void>>;

beforeEach(() => {
  vi.clearAllMocks();
  app = App.createConfigured__().asOriginalType__();
  isSuccessorEnabled = vi.fn<() => boolean>(() => false);
  renderSuggestionBanner = vi.fn<(containerEl: HTMLElement) => void>();
  renderSuccessorEnabledBanner = vi.fn<(containerEl: HTMLElement) => void>();
});

describe('PluginSettingsTab', () => {
  it('should declare only the two banner rows and no settings', () => {
    const tab = createTab();

    expect(tab.getSettingDefinitions()).toHaveLength(2);
  });

  it('should keep both banner rows out of the settings search', () => {
    const tab = createTab();

    expect(tab.getSettingDefinitions().map((definition) => castTo<SearchableDefinition>(definition).searchable)).toEqual([false, false]);
  });

  it('should show the suggestion row, not the successor row, while the successor is not enabled', () => {
    const tab = createTab();

    expect(isRowVisible(tab, SUGGESTION_ROW_INDEX)).toBe(true);
    expect(isRowVisible(tab, SUCCESSOR_ENABLED_ROW_INDEX)).toBe(false);
  });

  it('should show the successor row, not the suggestion row, once the successor is enabled', () => {
    isSuccessorEnabled.mockReturnValue(true);
    const tab = createTab();

    expect(isRowVisible(tab, SUGGESTION_ROW_INDEX)).toBe(false);
    expect(isRowVisible(tab, SUCCESSOR_ENABLED_ROW_INDEX)).toBe(true);
  });

  it('should render the suggestion banner into an emptied row element', () => {
    const tab = createTab();
    const setting = createLeftoverSetting(tab);

    renderRow(tab, SUGGESTION_ROW_INDEX, setting);

    expect(renderSuggestionBanner).toHaveBeenCalledWith(setting.settingEl);
    expect(setting.settingEl.textContent).toBe('');
  });

  it('should render the successor banner into an emptied row element', () => {
    const tab = createTab();
    const setting = createLeftoverSetting(tab);

    renderRow(tab, SUCCESSOR_ENABLED_ROW_INDEX, setting);

    expect(renderSuccessorEnabledBanner).toHaveBeenCalledWith(setting.settingEl);
    expect(setting.settingEl.textContent).toBe('');
  });
});

function createLeftoverSetting(tab: PluginSettingsTab): SettingEx {
  const setting = new SettingEx(tab.containerEl);
  setting.setName('Leftover');
  return setting;
}

function createMockSettingsComponent(): PluginSettingsComponentBase<PluginSettings> {
  const validationMessages = {
    isAdvancedMetadataCacheSuggestionDeclined: ''
  };
  return strictProxy<PluginSettingsComponentBase<PluginSettings>>({
    defaultSettings: new PluginSettings(),
    on: vi.fn().mockReturnValue({ asyncEventSource: { offref: vi.fn() } }),
    revalidate: vi.fn(() => Promise.resolve(validationMessages)),
    saveToFile: vi.fn(() => noopAsync()),
    setProperty: vi.fn(() => Promise.resolve('')),
    settingsState: {
      effectiveValues: new PluginSettings(),
      inputValues: new PluginSettings(),
      validationMessages
    }
  });
}

function createTab(): PluginSettingsTab {
  const plugin = strictProxy<Plugin>({
    app,
    manifest: { id: 'test-plugin' }
  });
  return new PluginSettingsTab({
    plugin,
    pluginSettingsComponent: createMockSettingsComponent(),
    pluginSuggestionComponent: strictProxy<PluginSuggestionComponent>({
      renderBanner: renderSuggestionBanner
    }),
    successorEnabledComponent: strictProxy<SuccessorEnabledComponent>({
      isSuccessorEnabled,
      renderBanner: renderSuccessorEnabledBanner
    })
  });
}

/**
 * Evaluates one row's `visible` predicate the way Obsidian does on every render.
 *
 * @param tab - The settings tab.
 * @param index - The index of the row.
 * @returns Whether the row would be rendered.
 */
function isRowVisible(tab: PluginSettingsTab, index: number): boolean {
  const visible = castTo<VisibleDefinition>(ensureNonNullable(tab.getSettingDefinitions()[index])).visible;
  return visible();
}

/**
 * Invokes one declared row's `render` callback the way Obsidian does when the tab is opened.
 *
 * @param tab - The settings tab.
 * @param index - The index of the row.
 * @param setting - The setting to render into.
 */
function renderRow(tab: PluginSettingsTab, index: number, setting: SettingEx): void {
  const definition = ensureNonNullable(tab.getSettingDefinitions()[index]);
  if (!('render' in definition)) {
    throw new Error(`The setting definition at index ${String(index)} does not render.`);
  }

  definition.render(setting, castTo<SettingGroup>(null));
}
