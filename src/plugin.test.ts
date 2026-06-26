import type {
  App,
  PluginManifest
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { ConsoleDebugComponent } from 'obsidian-dev-utils/obsidian/components/console-debug-component';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { BacklinkCacheComponent } from './backlink-cache-component.ts';
import { RefreshBacklinkPanelsCommandHandler } from './command-handlers/refresh-backlink-panels-command-handler.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { Plugin } from './plugin.ts';

vi.mock('obsidian-dev-utils/obsidian/active-file-provider', () => ({
  AppActiveFileProvider: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/command-handlers/command-handler-component', () => ({
  CommandHandlerComponent: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/command-registrar', () => ({
  PluginCommandRegistrar: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/components/menu-event-registrar-component', () => ({
  MenuEventRegistrarComponent: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/components/plugin-settings-tab-component', () => ({
  PluginSettingsTabComponent: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/data-handler', () => ({
  PluginDataHandler: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-event-source', () => ({
  PluginEventSourceImpl: vi.fn()
}));

vi.mock('./backlink-cache-component.ts', () => ({
  BacklinkCacheComponent: vi.fn()
}));

vi.mock('./command-handlers/refresh-backlink-panels-command-handler.ts', () => ({
  RefreshBacklinkPanelsCommandHandler: vi.fn()
}));

vi.mock('./plugin-settings-component.ts', () => ({
  PluginSettingsComponent: vi.fn()
}));

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: vi.fn()
}));

interface PluginInternals {
  _abortSignalComponent: AbortSignalComponent;
  _consoleDebugComponent: ConsoleDebugComponent;
  _pluginNoticeComponent: PluginNoticeComponent;
  onloadImpl(): void;
}

function createMockApp(): App {
  return strictProxy<App>({});
}

function createMockManifest(): PluginManifest {
  return strictProxy<PluginManifest>({
    id: 'backlink-cache',
    name: 'Backlink Cache'
  });
}

describe('Plugin', () => {
  it('should wire up all components in onloadImpl', () => {
    const app = createMockApp();
    const plugin = new Plugin(app, createMockManifest());
    const internals = castTo<PluginInternals>(plugin);
    internals._abortSignalComponent = strictProxy<AbortSignalComponent>({ abortSignal: castTo<AbortSignal>({ aborted: false }) });
    internals._consoleDebugComponent = strictProxy<ConsoleDebugComponent>({ consoleDebug: vi.fn() });
    internals._pluginNoticeComponent = strictProxy<PluginNoticeComponent>({});
    const addChildSpy = vi.spyOn(plugin, 'addChild');

    internals.onloadImpl();

    expect(PluginSettingsComponent).toHaveBeenCalledOnce();
    expect(PluginSettingsTab).toHaveBeenCalledOnce();
    expect(BacklinkCacheComponent).toHaveBeenCalledOnce();
    expect(RefreshBacklinkPanelsCommandHandler).toHaveBeenCalledOnce();
    expect(addChildSpy).toHaveBeenCalledTimes(5);
  });
});
