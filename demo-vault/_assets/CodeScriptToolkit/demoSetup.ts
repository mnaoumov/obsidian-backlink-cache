import type { App } from 'obsidian';

import { configureCommunityPlugin } from 'obsidian-dev-utils/obsidian/community-plugins';

const PLUGIN_ID = 'backlink-cache';

/**
 * Clears a previous "Not now" and reloads the plugin, so the successor suggestion shows again.
 *
 * Manual equivalent: delete the plugin's `data.json`, then disable and enable **`Backlink Cache`** in
 * **Settings -> Community plugins**.
 */
export async function showSuggestionAgain(app: App): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: { isAdvancedMetadataCacheSuggestionDeclined: false } });
  await app.plugins.disablePlugin(PLUGIN_ID);
  await app.plugins.enablePlugin(PLUGIN_ID);
}
