import type { SettingDefinitionItem } from 'obsidian';

import { requireApiVersion } from 'obsidian';
import {
  PluginSettingsTabBase,
  SAVE_TO_FILE_CONTEXT
} from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';
import { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';

import type { PluginSettings } from './plugin-settings.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  public override displayLegacy(): void {
    super.displayLegacy();

    new SettingEx(this.containerEl)
      .setName('Should automatically refresh backlink panels')
      .setDesc('Whether to refresh the backlink panels automatically when a note is saved.')
      .addToggle((toggle) => {
        this.bind({
          propertyName: 'shouldAutomaticallyRefreshBacklinkPanels',
          valueComponent: toggle
        });
      });

    new SettingEx(this.containerEl)
      .setName('Should show progress bar on load')
      .setDesc('Whether to show progress bar on load.')
      .addToggle((toggle) => {
        this.bind({
          propertyName: 'shouldShowProgressBarOnLoad',
          valueComponent: toggle
        });
      });
  }

  public override getControlValue(key: string): unknown {
    if (key === 'shouldAutomaticallyRefreshBacklinkPanels' || key === 'shouldShowProgressBarOnLoad') {
      return this.pluginSettingsComponent.settingsState.inputValues[key];
    }

    return undefined;
  }

  public override getSettingDefinitions(): SettingDefinitionItem<keyof PluginSettings>[] {
    if (!requireApiVersion('1.13.0')) {
      return [];
    }

    return [
      {
        control: {
          key: 'shouldAutomaticallyRefreshBacklinkPanels',
          type: 'toggle'
        },
        desc: 'Whether to refresh the backlink panels automatically when a note is saved.',
        name: 'Should automatically refresh backlink panels'
      },
      {
        control: {
          key: 'shouldShowProgressBarOnLoad',
          type: 'toggle'
        },
        desc: 'Whether to show progress bar on load.',
        name: 'Should show progress bar on load'
      }
    ];
  }

  public override async setControlValue(key: string, value: unknown): Promise<void> {
    if (typeof value !== 'boolean') {
      return;
    }

    if (key === 'shouldAutomaticallyRefreshBacklinkPanels' || key === 'shouldShowProgressBarOnLoad') {
      await this.pluginSettingsComponent.setProperty(key, value);
      await this.pluginSettingsComponent.saveToFile(SAVE_TO_FILE_CONTEXT);
    }
  }
}
