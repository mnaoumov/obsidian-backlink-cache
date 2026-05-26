import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventSource } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';

describe('PluginSettingsComponent', () => {
  it('should create with PluginSettings class', () => {
    const dataHandler = strictProxy<DataHandler>({});
    const pluginEventSource = strictProxy<PluginEventSource>({});

    const component = new PluginSettingsComponent({
      dataHandler,
      pluginEventSource
    });

    expect(component.settings).toBeInstanceOf(PluginSettings);
  });
});
