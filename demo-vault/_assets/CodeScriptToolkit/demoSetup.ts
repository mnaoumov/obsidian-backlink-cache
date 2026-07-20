import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import {
  enableCommunityPlugin,
  installCommunityPlugin
} from 'obsidian-dev-utils/obsidian/community-plugins';

// Backlink Cache patches `app.metadataCache.getBacklinksForFile`, which the feature notes call
// Directly from their own code-buttons, so this helper only needs to install and enable the shared
// CodeScript Toolkit plugin used by the prerequisite note's button.
export async function installAndEnable(app: App, pluginId: string): Promise<void> {
  await installCommunityPlugin({ app, pluginId });
  await enableCommunityPlugin({ app, pluginId });
  new Notice(`Installed and enabled: ${pluginId}`);
}
