import type { App } from 'obsidian';

const PLUGIN_ID = 'backlink-cache';

/**
 * Clears a previous "Not now" and reloads the plugin, so the successor suggestion shows again.
 *
 * Manual equivalent: delete the plugin's `data.json`, then disable and enable **`Backlink Cache`** in
 * **Settings -> Community plugins**.
 */
export async function showSuggestionAgain(app: App): Promise<void> {
  // No library import: `CodeScript Toolkit` serves only its own bundled modules to vault scripts, and the
  // settings are edited while the plugin is disabled, so it cannot save over them.
  await app.plugins.disablePlugin(PLUGIN_ID);
  const dataPath = `${app.vault.configDir}/plugins/${PLUGIN_ID}/data.json`;
  const data: Record<string, unknown> = await app.vault.adapter.exists(dataPath)
    ? JSON.parse(await app.vault.adapter.read(dataPath)) as Record<string, unknown>
    : {};
  data['isAdvancedMetadataCacheSuggestionDeclined'] = false;
  await app.vault.adapter.write(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  await app.plugins.enablePlugin(PLUGIN_ID);
}
