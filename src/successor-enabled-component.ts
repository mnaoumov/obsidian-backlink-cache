import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type { App } from 'obsidian';

import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import { CallbackLayoutReadyComponent } from '@mnaoumov/obsidian-lib/components/layout-ready-component';
import { appendCodeBlock } from '@mnaoumov/obsidian-lib/html-element';
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

        // It stays until the user picks one of its two buttons: no timeout, no hiding on a stray click and no
        // close button, because there is deliberately no decline. Both buttons unload this plugin, which hides it.
        this.pluginNoticeComponent.showNotice(
          createFragment((fragmentEl) => {
            this.renderContent(fragmentEl);
          }),
          { shouldHideOnClick: false, shouldShowCloseButton: false }
        );
      })
    );
  }

  public renderBanner(containerEl: HTMLElement): void {
    this.renderContent(containerEl.createDiv());
  }

  private renderContent(containerEl: DocumentFragment | HTMLElement): void {
    const messageEl = containerEl.createDiv();
    // `appendCodeBlock`, not a bare `<code>`: inside a notice a bare one only changes the font, so the names do not
    // read as code.
    appendCodeBlock(messageEl, this.successorPluginName);
    messageEl.appendText(' is enabled and replaces ');
    appendCodeBlock(messageEl, this.pluginName);
    messageEl.appendText(', which no longer does anything. Uninstall it, or disable it if you want to keep the files.');

    // The labels are the bare verbs: the message right above names the plugin, and a notice is too narrow for two
    // labels that repeat its name to share one row.
    const buttonsEl = containerEl.createDiv({ cls: 'backlink-cache-successor-enabled-buttons' });
    new ButtonComponent(buttonsEl)
      .setButtonText('Uninstall')
      .setCta()
      .onClick(convertAsyncToSync(async () => {
        await this.app.plugins.uninstallPlugin(this.pluginId);
      }));
    new ButtonComponent(buttonsEl)
      .setButtonText('Disable')
      .onClick(convertAsyncToSync(async () => {
        await this.app.plugins.disablePluginAndSave(this.pluginId);
      }));
  }
}
