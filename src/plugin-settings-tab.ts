import type { SettingDefinitionItem } from 'obsidian';
import type { PluginSuggestionComponent } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';
import type { PluginSettingsTabBaseConstructorParams } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';
import type { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';

import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';
import type { SuccessorEnabledComponent } from './successor-enabled-component.ts';

interface PluginSettingsTabConstructorParams extends PluginSettingsTabBaseConstructorParams<PluginSettings> {
  readonly pluginSuggestionComponent: PluginSuggestionComponent;
  readonly successorEnabledComponent: SuccessorEnabledComponent;
}

// The tab holds no settings: its only content is one banner pointing to the successor, the suggestion while the
// successor is not enabled, and the uninstall/disable banner once it is.
export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  private readonly pluginSuggestionComponent: PluginSuggestionComponent;
  private readonly successorEnabledComponent: SuccessorEnabledComponent;

  public constructor(params: PluginSettingsTabConstructorParams) {
    super(params);
    this.pluginSuggestionComponent = params.pluginSuggestionComponent;
    this.successorEnabledComponent = params.successorEnabledComponent;
  }

  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      // A banner has to travel as a row: Obsidian renders the declarative definitions and never calls `display()`
      // once `getSettingDefinitions()` is non-empty, so there is no container to write into otherwise. The row
      // body is emptied first, leaving the Setting element as a bare host for the banner.
      this.settingEx({
        name: '',
        render: (setting) => {
          this.renderBanner(setting, (containerEl) => {
            this.pluginSuggestionComponent.renderBanner(containerEl);
          });
        },
        searchable: false,
        visible: () => !this.successorEnabledComponent.isSuccessorEnabled()
      }),
      this.settingEx({
        name: '',
        render: (setting) => {
          this.renderBanner(setting, (containerEl) => {
            this.successorEnabledComponent.renderBanner(containerEl);
          });
        },
        searchable: false,
        visible: () => this.successorEnabledComponent.isSuccessorEnabled()
      })
    ];
  }

  private renderBanner(setting: SettingEx, render: (containerEl: HTMLElement) => void): void {
    setting.settingEl.empty();
    render(setting.settingEl);
  }
}
