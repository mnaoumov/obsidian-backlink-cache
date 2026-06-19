import type { Plugin } from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettings } from './plugin-settings.ts';

import { PluginSettingsTab } from './plugin-settings-tab.ts';

vi.mock('obsidian-dev-utils/obsidian/setting-ex', () => {
  class MockSettingEx {
    private readonly callbacks: ((toggle: unknown) => void)[] = [];
    private desc = '';
    private name = '';

    public constructor(public readonly containerEl: HTMLElement) {
    }

    public addToggle(cb: (toggle: unknown) => void): this {
      this.callbacks.push(cb);
      cb({ getValue: vi.fn(), onChange: vi.fn(), setValue: vi.fn() });
      return this;
    }

    public getDesc(): string {
      return this.desc;
    }

    public getName(): string {
      return this.name;
    }

    public setDesc(desc: string): this {
      this.desc = desc;
      return this;
    }

    public setName(name: string): this {
      this.name = name;
      return this;
    }
  }

  return { SettingEx: MockSettingEx };
});

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

    tab.containerEl = activeDocument.createElement('div');

    const bindSpy = vi.spyOn(tab, 'bind').mockReturnValue(undefined);

    tab.displayLegacy();

    expect(bindSpy).toHaveBeenCalledTimes(2);
    expect(bindSpy.mock.calls[0]?.[1]).toBe('shouldAutomaticallyRefreshBacklinkPanels');
    expect(bindSpy.mock.calls[1]?.[1]).toBe('shouldShowProgressBarOnLoad');
  });
});
