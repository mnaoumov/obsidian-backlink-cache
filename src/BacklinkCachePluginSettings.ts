import { PluginSettingsBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsBase';

export class BacklinkCachePluginSettings extends PluginSettingsBase {
  public shouldAutomaticallyRefreshBacklinkPanels = false;

  public constructor(data: unknown) {
    super();
    this.init(data);
  }
}
