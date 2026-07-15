import type { Plugin } from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { requireApiVersion } from 'obsidian';
import { noopAsync } from 'obsidian-dev-utils/function';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettings } from './plugin-settings.ts';

import { PluginSettingsTab } from './plugin-settings-tab.ts';

vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian')>(),
  requireApiVersion: vi.fn(() => true)
}));

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

    tab.displayLegacy();

    expect(bindSpy).toHaveBeenCalledTimes(2);
    expect(bindSpy.mock.calls[0]?.[0].propertyName).toBe('shouldAutomaticallyRefreshBacklinkPanels');
    expect(bindSpy.mock.calls[1]?.[0].propertyName).toBe('shouldShowProgressBarOnLoad');
  });

  it('should expose declarative settings and persist control changes', async () => {
    const saveToFile = vi.fn(() => noopAsync());
    const setProperty = vi.fn(() => Promise.resolve(''));
    const settings = {
      shouldAutomaticallyRefreshBacklinkPanels: false,
      shouldShowProgressBarOnLoad: true
    };
    const pluginSettingsComponent = strictProxy<PluginSettingsComponentBase<PluginSettings>>({
      saveToFile,
      setProperty,
      settingsState: {
        effectiveValues: settings,
        inputValues: settings,
        validationMessages: {
          shouldAutomaticallyRefreshBacklinkPanels: '',
          shouldShowProgressBarOnLoad: ''
        }
      }
    });
    const plugin = strictProxy<Plugin>({ app: {} });
    const tab = new PluginSettingsTab({ plugin, pluginSettingsComponent });

    expect(tab.getSettingDefinitions()).toMatchObject([
      { name: 'Should automatically refresh backlink panels' },
      { name: 'Should show progress bar on load' }
    ]);
    expect(tab.getControlValue('shouldShowProgressBarOnLoad')).toBe(true);
    expect(tab.getControlValue('unknown')).toBeUndefined();

    await tab.setControlValue('shouldShowProgressBarOnLoad', false);
    expect(setProperty).toHaveBeenCalledWith('shouldShowProgressBarOnLoad', false);
    expect(saveToFile).toHaveBeenCalledOnce();

    await tab.setControlValue('shouldShowProgressBarOnLoad', 'false');
    await tab.setControlValue('unknown', false);
    expect(setProperty).toHaveBeenCalledOnce();

    vi.mocked(requireApiVersion).mockReturnValueOnce(false);
    expect(tab.getSettingDefinitions()).toEqual([]);
  });
});
