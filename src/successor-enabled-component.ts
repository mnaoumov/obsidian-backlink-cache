import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type { App } from 'obsidian';

import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import { CallbackLayoutReadyComponent } from '@mnaoumov/obsidian-lib/components/layout-ready-component';
import {
  getInstalledPluginState,
  InstalledPluginState
} from '@mnaoumov/obsidian-lib/plugin/plugin-install-state';
import { convertAsyncToSync } from '@mnaoumov/typescript-lib/async';
import { ButtonComponent } from 'obsidian';

interface SuccessorEnabledComponentConstructorParams {
  readonly app: App;
  readonly pluginId: string;
  readonly pluginName: string;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly successorPluginId: string;
  readonly successorPluginName: string;
}

/**
 * Once the successor is enabled, this plugin has nothing left to offer, so it asks to be removed: a notice on
 * load and a settings-tab banner, each with exactly two buttons, uninstall and disable. There is deliberately no
 * decline, because staying installed beside the successor does nothing for the user.
 *
 * This is the counterpart of the successor suggestion, which covers the case where the successor is NOT enabled.
 */
export class SuccessorEnabledComponent extends ComponentEx {
  private readonly app: App;
  private readonly pluginId: string;
  private readonly pluginName: string;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly successorPluginId: string;
  private readonly successorPluginName: string;

  public constructor(params: SuccessorEnabledComponentConstructorParams) {
    super();
    this.app = params.app;
    this.pluginId = params.pluginId;
    this.pluginName = params.pluginName;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.successorPluginId = params.successorPluginId;
    this.successorPluginName = params.successorPluginName;
  }

  public isSuccessorEnabled(): boolean {
    return getInstalledPluginState({
      app: this.app,
      pluginId: this.successorPluginId
    }) === InstalledPluginState.Enabled;
  }

  // Layout-ready, because plugins load in an unspecified order, so the successor may be enabled a moment after
  // this plugin.
  public override onload(): void {
    this.addChild(
      new CallbackLayoutReadyComponent(this.app, () => {
        if (!this.isSuccessorEnabled()) {
          return;
        }

        this.pluginNoticeComponent.showNotice(createFragment((fragmentEl) => {
          this.renderContent(fragmentEl);
        }));
      })
    );
  }

  public renderBanner(containerEl: HTMLElement): void {
    this.renderContent(containerEl.createDiv());
  }

  private addButton(buttonsEl: HTMLElement, verb: string, onClick: () => Promise<void>): ButtonComponent {
    const button = new ButtonComponent(buttonsEl).onClick(convertAsyncToSync(onClick));
    button.buttonEl.appendText(`${verb} `);
    button.buttonEl.createEl('code', { text: this.pluginName });
    return button;
  }

  private renderContent(containerEl: DocumentFragment | HTMLElement): void {
    const messageEl = containerEl.createDiv();
    messageEl.appendText('You have ');
    messageEl.createEl('code', { text: this.successorPluginName });
    messageEl.appendText(' installed which is a successor for ');
    messageEl.createEl('code', { text: this.pluginName });

    const buttonsEl = containerEl.createDiv();
    this.addButton(buttonsEl, 'Uninstall', async () => {
      await this.app.plugins.uninstallPlugin(this.pluginId);
    }).setCta();
    this.addButton(buttonsEl, 'Disable', async () => {
      await this.app.plugins.disablePluginAndSave(this.pluginId);
    });
  }
}
