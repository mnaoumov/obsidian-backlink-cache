import type {
  App,
  CachedMetadata
} from 'obsidian';

import { fixFrontmatterMarkdownLinks } from 'obsidian-dev-utils/obsidian/link';
import { parseMetadata } from 'obsidian-dev-utils/obsidian/metadata-cache';

export async function parseMetadataEx(app: App, str: string): Promise<CachedMetadata> {
  const metadata = await parseMetadata(app, str);
  if (app.plugins.getPlugin('frontmatter-markdown-links')) {
    fixFrontmatterMarkdownLinks(metadata);
  }
  return metadata;
}
