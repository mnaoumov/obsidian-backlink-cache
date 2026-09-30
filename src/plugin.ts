import { OpenDemoVaultCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { PluginSuggestionComponent } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';
import { PluginEventSourceImpl } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import {
  ADVANCED_METADATA_CACHE_PLUGIN_ID,
  ADVANCED_METADATA_CACHE_PLUGIN_NAME
} from './advanced-metadata-cache.ts';
import { BacklinkCacheComponent } from './backlink-cache-component.ts';
import { RefreshBacklinkPanelsCommandHandler } from './command-handlers/refresh-backlink-panels-command-handler.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';

const SUGGESTION_REASON = 'Backlink Cache is deprecated and will get no further updates.'
  + ' Advanced Metadata Cache replaces it, with the same backlink cache and more.'
  + ' Once it is enabled, disable and uninstall Backlink Cache.';

export class Plugin extends PluginBase {
  protected override async onloadImpl(): Promise<void> {
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler: new PluginDataHandler(this),
        pluginEventSource: new PluginEventSourceImpl(this)
      })
    );
    this.pluginSettingsComponent = pluginSettingsComponent;

    const pluginSuggestionComponent = this.addChild(
      new PluginSuggestionComponent({
        app: this.app,
        isSuggestionDeclined: (): boolean => pluginSettingsComponent.settings.isAdvancedMetadataCacheSuggestionDeclined,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent,
        reason: SUGGESTION_REASON,
        // `editAndSave`, not `setProperty`: a decline has to outlive a reload, and `setProperty` only edits
        // the in-memory state.
        setSuggestionDeclined: async (isDeclined): Promise<void> => {
          await pluginSettingsComponent.editAndSave((settings) => {
            settings.isAdvancedMetadataCacheSuggestionDeclined = isDeclined;
          });
        },
        suggestedPluginId: ADVANCED_METADATA_CACHE_PLUGIN_ID,
        suggestedPluginName: ADVANCED_METADATA_CACHE_PLUGIN_NAME
      })
    );

    const pluginSettingsTab = new PluginSettingsTab({
      plugin: this,
      pluginSettingsComponent,
      pluginSuggestionComponent
    });
    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab
      })
    );

    const backlinkCacheComponent = this.addChild(
      new BacklinkCacheComponent({
        abortSignalComponent: this.abortSignalComponent,
        app: this.app,
        consoleDebugComponent: this.consoleDebugComponent,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent
      })
    );

    await this.commandHandlerComponent.registerCommandHandlers(() => [
      new RefreshBacklinkPanelsCommandHandler(backlinkCacheComponent),
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      })
    ]);
  }
}
