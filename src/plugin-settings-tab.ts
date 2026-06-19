import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';
import { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';

import type { PluginSettings } from './plugin-settings.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  public override displayLegacy(): void {
    super.displayLegacy();

    new SettingEx(this.containerEl)
      .setName('Should automatically refresh backlink panels')
      .setDesc('Whether to refresh the backlink panels automatically when a note is saved.')
      .addToggle((toggle) => {
        this.bind(toggle, 'shouldAutomaticallyRefreshBacklinkPanels');
      });

    new SettingEx(this.containerEl)
      .setName('Should show progress bar on load')
      .setDesc('Whether to show progress bar on load.')
      .addToggle((toggle) => {
        this.bind(toggle, 'shouldShowProgressBarOnLoad');
      });
  }
}
