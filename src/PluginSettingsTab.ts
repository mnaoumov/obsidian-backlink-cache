import { Setting } from 'obsidian';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';

import type { PluginTypes } from './PluginTypes.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginTypes> {
  public override display(): void {
    super.display();
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName('Should automatically refresh backlink panels')
      .setDesc('Whether to refresh the backlink panels automatically when a note is saved.')
      .addToggle((toggle) => {
        this.bind(toggle, 'shouldAutomaticallyRefreshBacklinkPanels');
      });

    new Setting(this.containerEl)
      .setName('Should show progress bar on load')
      .setDesc('Whether to show progress bar on load.')
      .addToggle((toggle) => {
        this.bind(toggle, 'shouldShowProgressBarOnLoad');
      });
  }
}
