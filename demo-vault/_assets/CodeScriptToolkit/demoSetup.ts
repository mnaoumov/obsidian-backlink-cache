import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import { configureCommunityPlugin } from 'obsidian-dev-utils/obsidian/community-plugins';

const PLUGIN_ID = 'backlink-cache';
const CENTRAL_TOPIC_PATH = 'Topics/Central topic.md';

interface DemoSettingsPatch {
  shouldAutomaticallyRefreshBacklinkPanels?: boolean;
  shouldShowProgressBarOnLoad?: boolean;
}

/**
 * Opens the note everything links to and reveals the core Backlinks pane beside it.
 *
 * The existing buttons query the cache through the API; this puts the UI that the same cache feeds on
 * screen, which is what the settings below are actually about.
 *
 * Manual equivalent: open `Topics/Central topic.md`, then run **Backlinks: Show backlinks**.
 */
export async function showCentralTopicBacklinks(app: App): Promise<void> {
  const note = app.vault.getFileByPath(CENTRAL_TOPIC_PATH);
  if (!note) {
    new Notice(`${CENTRAL_TOPIC_PATH} is missing from this vault.`);
    return;
  }

  await app.workspace.getLeaf(false).openFile(note);
  app.commands.executeCommandById('backlink:open-backlinks');
}

/**
 * Rebuilds the visible Backlinks panes on demand.
 *
 * This is the command that matters when `shouldAutomaticallyRefreshBacklinkPanels` is off — which is
 * the default, so it is the behavior most readers actually have.
 *
 * Manual equivalent: **Backlink Cache: Refresh backlink panels** in the Command Palette.
 */
export function refreshBacklinkPanels(app: App): void {
  app.commands.executeCommandById(`${PLUGIN_ID}:refresh-backlink-panels`);
}

/**
 * Applies a settings patch, live, through the plugin's own settings component.
 *
 * Manual equivalent: change the same option in **Settings -> Community plugins -> Backlink Cache**.
 */
export async function changeSettings(app: App, patch: DemoSettingsPatch): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: patch });
  new Notice('Applied.');
}
