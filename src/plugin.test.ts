import type {
  App,
  PluginManifest
} from 'obsidian';

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

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin', () => {
  class MockPluginBase {
    public abortSignalComponent = { abortSignal: { aborted: false } };
    public app: App;
    public consoleDebugComponent = { consoleDebug: vi.fn() };
    public manifest: PluginManifest;

    public constructor(app: App, manifest: PluginManifest) {
      this.app = app;
      this.manifest = manifest;
    }

    public addChild(child: unknown): unknown {
      return child;
    }
  }
  return { PluginBase: MockPluginBase };
});

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
    const addChildSpy = vi.spyOn(plugin, 'addChild');

    castTo<PluginInternals>(plugin).onloadImpl();

    expect(PluginSettingsComponent).toHaveBeenCalledOnce();
    expect(PluginSettingsTab).toHaveBeenCalledOnce();
    expect(BacklinkCacheComponent).toHaveBeenCalledOnce();
    expect(RefreshBacklinkPanelsCommandHandler).toHaveBeenCalledOnce();
    expect(addChildSpy).toHaveBeenCalledTimes(5);
  });
});
