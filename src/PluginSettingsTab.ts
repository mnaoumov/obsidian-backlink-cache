import { Setting } from 'obsidian';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';

import type { Plugin } from './Plugin.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<Plugin> {
  public override display(): void {
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName('Automatically refresh backlink panels')
      .setDesc('If enabled, the backlink panels will be refreshed automatically when a note is saved.')
      .addToggle((toggle) => {
        this.bind(toggle, 'shouldAutomaticallyRefreshBacklinkPanels');
      });
  }
}
