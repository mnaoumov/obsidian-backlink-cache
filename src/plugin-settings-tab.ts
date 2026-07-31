import type { SettingDefinitionItem } from 'obsidian';

import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      this.settingEx({
        desc: 'Whether to refresh the backlink panels automatically when a note is saved.',
        name: 'Should automatically refresh backlink panels',
        render: (setting) => {
          setting.addToggle((toggle) => {
            this.bind({
              propertyName: 'shouldAutomaticallyRefreshBacklinkPanels',
              valueComponent: toggle
            });
          });
        }
      }),
      this.settingEx({
        desc: 'Whether to show progress bar on load.',
        name: 'Should show progress bar on load',
        render: (setting) => {
          setting.addToggle((toggle) => {
            this.bind({
              propertyName: 'shouldShowProgressBarOnLoad',
              valueComponent: toggle
            });
          });
        }
      })
    ];
  }
}
