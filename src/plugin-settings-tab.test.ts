import type {
  Plugin,
  SettingGroup
} from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettings } from './plugin-settings.ts';

import { PluginSettingsTab } from './plugin-settings-tab.ts';

describe('PluginSettingsTab', () => {
  it('should display two toggle settings bound to the correct properties', () => {
    const pluginSettingsComponent = strictProxy<PluginSettingsComponentBase<PluginSettings>>({
      on: vi.fn().mockReturnValue({ id: 'ref' }),
      settings: {
        shouldAutomaticallyRefreshBacklinkPanels: false,
        shouldShowProgressBarOnLoad: true
      },
      settingsState: {
        effectiveValues: {
          shouldAutomaticallyRefreshBacklinkPanels: false,
          shouldShowProgressBarOnLoad: true
        },
        inputValues: {
          shouldAutomaticallyRefreshBacklinkPanels: false,
          shouldShowProgressBarOnLoad: true
        },
        validationMessages: {
          shouldAutomaticallyRefreshBacklinkPanels: '',
          shouldShowProgressBarOnLoad: ''
        }
      }
    });

    const plugin = strictProxy<Plugin>({
      app: {
        workspace: {
          on: vi.fn().mockReturnValue({ id: 'test' })
        }
      }
    });

    const tab = new PluginSettingsTab({
      plugin,
      pluginSettingsComponent
    });

    tab.containerEl = activeWindow.createDiv();

    const bindSpy = vi.spyOn(tab, 'bind').mockImplementation((params) => params.valueComponent);

    const definitions = tab.getSettingDefinitions();
    for (const definition of definitions) {
      if ('render' in definition) {
        definition.render(new SettingEx(tab.containerEl), castTo<SettingGroup>(null));
      }
    }

    expect(definitions.map((definition) => 'name' in definition ? definition.name : '')).toStrictEqual([
      'Should automatically refresh backlink panels',
      'Should show progress bar on load'
    ]);
    expect(bindSpy).toHaveBeenCalledTimes(2);
    expect(bindSpy.mock.calls[0]?.[0].propertyName).toBe('shouldAutomaticallyRefreshBacklinkPanels');
    expect(bindSpy.mock.calls[1]?.[0].propertyName).toBe('shouldShowProgressBarOnLoad');
  });
});
