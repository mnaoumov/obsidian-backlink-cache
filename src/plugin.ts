import { PluginSettingsTabComponent } from '@mnaoumov/obsidian-lib/components/plugin-settings-tab-component';
import { PluginSuggestionComponent } from '@mnaoumov/obsidian-lib/components/plugin-suggestion-component';
import { PluginDataHandler } from '@mnaoumov/obsidian-lib/data-handler';
import { appendCodeBlock } from '@mnaoumov/obsidian-lib/html-element';
import { PluginBase } from '@mnaoumov/obsidian-lib/plugin/plugin';
import { PluginEventSourceImpl } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';

import {
  ADVANCED_METADATA_CACHE_PLUGIN_ID,
  ADVANCED_METADATA_CACHE_PLUGIN_NAME
} from './advanced-metadata-cache.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { SuccessorEnabledComponent } from './successor-enabled-component.ts';

// The plugin's one job is to point to its successor. It used to keep a backlink cache, and every part of that
// is gone: `Advanced Metadata Cache` carries it now.
export class Plugin extends PluginBase {
  protected override onloadImpl(): void {
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler: new PluginDataHandler(this),
        pluginEventSource: new PluginEventSourceImpl(this)
      })
    );
    this.pluginSettingsComponent = pluginSettingsComponent;

    // Shown while the successor is not enabled: installed but disabled, or not installed at all.
    const pluginSuggestionComponent = this.addChild(
      new PluginSuggestionComponent({
        app: this.app,
        isSuggestionDeclined: (): boolean => pluginSettingsComponent.settings.isAdvancedMetadataCacheSuggestionDeclined,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent,
        reason: createSuggestionReason(this.manifest.name),
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

    // Shown once the successor is enabled.
    const successorEnabledComponent = this.addChild(
      new SuccessorEnabledComponent({
        app: this.app,
        pluginId: this.manifest.id,
        pluginName: this.manifest.name,
        pluginNoticeComponent: this.pluginNoticeComponent,
        successorPluginId: ADVANCED_METADATA_CACHE_PLUGIN_ID,
        successorPluginName: ADVANCED_METADATA_CACHE_PLUGIN_NAME
      })
    );

    const pluginSettingsTab = new PluginSettingsTab({
      plugin: this,
      pluginSettingsComponent,
      pluginSuggestionComponent,
      successorEnabledComponent
    });
    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab
      })
    );
  }
}

function createSuggestionReason(pluginName: string): DocumentFragment {
  return createFragment((fragment) => {
    appendCodeBlock(fragment, pluginName);
    fragment.appendText(' no longer does anything: ');
    appendCodeBlock(fragment, ADVANCED_METADATA_CACHE_PLUGIN_NAME);
    fragment.appendText(' replaced it. Install it to keep the backlink cache, then uninstall ');
    appendCodeBlock(fragment, pluginName);
    fragment.appendText('.');
  });
}
