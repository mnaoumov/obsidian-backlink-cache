import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type {
  App as AppOriginal,
  Notice
} from 'obsidian';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { waitForAllAsyncOperations } from '@mnaoumov/typescript-test-toolkit/async-operation-tracking';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { SuccessorEnabledComponent } from './successor-enabled-component.ts';

interface PluginLifecycle {
  disablePluginAndSave: (id: string) => Promise<void>;
  uninstallPlugin: (id: string) => Promise<void>;
}

const PLUGIN_ID = 'backlink-cache';
const PLUGIN_NAME = 'Backlink Cache';
const SUCCESSOR_PLUGIN_ID = 'advanced-metadata-cache';
const SUCCESSOR_PLUGIN_NAME = 'Advanced Metadata Cache';

let appMock: App;
let app: AppOriginal;
let disablePluginAndSave: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
let showNotice: ReturnType<typeof vi.fn<(message: DocumentFragment | string) => Notice>>;
let uninstallPlugin: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;

beforeEach(() => {
  vi.useFakeTimers();
  appMock = App.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
    callback();
  });
  app = appMock.asOriginalType__();
  disablePluginAndSave = vi.fn<(id: string) => Promise<void>>(() => noopAsync());
  uninstallPlugin = vi.fn<(id: string) => Promise<void>>(() => noopAsync());
  const lifecycle: PluginLifecycle = { disablePluginAndSave, uninstallPlugin };
  Object.assign(appMock.plugins, lifecycle);
  showNotice = vi.fn<(message: DocumentFragment | string) => Notice>(() => strictProxy<Notice>({}));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SuccessorEnabledComponent', () => {
  it('should report the successor as not enabled when it is not installed', () => {
    expect(createComponent().isSuccessorEnabled()).toBe(false);
  });

  it('should report the successor as enabled once it is enabled', () => {
    enableSuccessor();

    expect(createComponent().isSuccessorEnabled()).toBe(true);
  });

  it('should show no notice while the successor is not enabled', async () => {
    await loadComponent(createComponent());

    expect(showNotice).not.toHaveBeenCalled();
  });

  it('should show no notice when it is unloaded before the layout is ready', async () => {
    enableSuccessor();
    let onLayoutReady: (() => void) | undefined;
    appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
      onLayoutReady = callback;
    });
    const component = createComponent();
    await loadComponent(component);
    component.unload();

    ensureNonNullable(onLayoutReady)();
    await vi.runAllTimersAsync();

    expect(showNotice).not.toHaveBeenCalled();
  });

  it('should show the owner-worded notice once the successor is enabled', async () => {
    enableSuccessor();

    await loadComponent(createComponent());

    const noticeEl = renderedNotice();
    expect(noticeEl.textContent).toContain(
      `You have ${SUCCESSOR_PLUGIN_NAME} installed which is a successor for ${PLUGIN_NAME}`
    );
    expect([...noticeEl.querySelectorAll('code')].map((codeEl) => codeEl.textContent)).toEqual([
      SUCCESSOR_PLUGIN_NAME,
      PLUGIN_NAME,
      PLUGIN_NAME,
      PLUGIN_NAME
    ]);
  });

  it('should offer exactly two buttons, uninstall and disable', async () => {
    enableSuccessor();

    await loadComponent(createComponent());

    expect(buttons(renderedNotice()).map((buttonEl) => buttonEl.textContent)).toEqual([
      `Uninstall ${PLUGIN_NAME}`,
      `Disable ${PLUGIN_NAME}`
    ]);
  });

  it('should uninstall the plugin from the uninstall button', async () => {
    enableSuccessor();
    await loadComponent(createComponent());

    ensureNonNullable(buttons(renderedNotice())[0]).click();
    await waitForAllAsyncOperations();

    expect(uninstallPlugin).toHaveBeenCalledWith(PLUGIN_ID);
    expect(disablePluginAndSave).not.toHaveBeenCalled();
  });

  it('should disable the plugin from the disable button', async () => {
    enableSuccessor();
    await loadComponent(createComponent());

    ensureNonNullable(buttons(renderedNotice())[1]).click();
    await waitForAllAsyncOperations();

    expect(disablePluginAndSave).toHaveBeenCalledWith(PLUGIN_ID);
    expect(uninstallPlugin).not.toHaveBeenCalled();
  });

  it('should render the same message and buttons as a banner', () => {
    const containerEl = createDiv();

    createComponent().renderBanner(containerEl);

    expect(containerEl.textContent).toContain(`which is a successor for ${PLUGIN_NAME}`);
    expect(buttons(containerEl)).toHaveLength(2);
  });
});

function buttons(containerEl: HTMLElement): HTMLButtonElement[] {
  return [...containerEl.querySelectorAll('button')];
}

function createComponent(): SuccessorEnabledComponent {
  return new SuccessorEnabledComponent({
    app,
    pluginId: PLUGIN_ID,
    pluginName: PLUGIN_NAME,
    pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice }),
    successorPluginId: SUCCESSOR_PLUGIN_ID,
    successorPluginName: SUCCESSOR_PLUGIN_NAME
  });
}

function enableSuccessor(): void {
  appMock.plugins.enabledPlugins.add(SUCCESSOR_PLUGIN_ID);
}

async function loadComponent(component: SuccessorEnabledComponent): Promise<void> {
  component.load();
  await vi.runAllTimersAsync();
  await waitForAllAsyncOperations();
}

function renderedNotice(): HTMLElement {
  expect(showNotice).toHaveBeenCalledOnce();
  const containerEl = createDiv();
  const message = ensureNonNullable(showNotice.mock.calls[0])[0];
  containerEl.append(message);
  return containerEl;
}
