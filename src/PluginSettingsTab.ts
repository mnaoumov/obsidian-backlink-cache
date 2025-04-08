import { Setting } from 'obsidian';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';

import type { PluginTypes } from './PluginTypes.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginTypes> {
  public override display(): void {
    super.display();
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName('Automatically refresh backlink panels')
      .setDesc('If enabled, the backlink panels will be refreshed automatically when a note is saved.')
      .addToggle((toggle) => {
        this.bind(toggle, 'shouldAutomaticallyRefreshBacklinkPanels');
      });
  }
}
