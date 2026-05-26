import type {
  App,
  CachedMetadata
} from 'obsidian';

import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { parseMetadataEx } from './metadata.ts';

vi.mock('obsidian-dev-utils/obsidian/link', () => ({
  fixFrontmatterMarkdownLinks: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/metadata-cache', () => ({
  parseMetadata: vi.fn()
}));

const { fixFrontmatterMarkdownLinks } = await import('obsidian-dev-utils/obsidian/link');
const { parseMetadata } = await import('obsidian-dev-utils/obsidian/metadata-cache');

describe('parseMetadataEx', () => {
  it('should return parsed metadata without fixing frontmatter links when plugin is not enabled', async () => {
    const metadata: CachedMetadata = {};
    vi.mocked(parseMetadata).mockResolvedValue(metadata);

    const app = strictProxy<App>({
      plugins: {
        getPlugin: vi.fn().mockReturnValue(null)
      }
    });

    const result = await parseMetadataEx(app, 'test content');

    expect(parseMetadata).toHaveBeenCalledWith(app, 'test content');
    expect(fixFrontmatterMarkdownLinks).not.toHaveBeenCalled();
    expect(result).toBe(metadata);
  });

  it('should fix frontmatter markdown links when frontmatter-markdown-links plugin is enabled', async () => {
    const metadata: CachedMetadata = {};
    vi.mocked(parseMetadata).mockResolvedValue(metadata);

    const app = strictProxy<App>({
      plugins: {
        getPlugin: vi.fn().mockReturnValue({})
      }
    });

    const result = await parseMetadataEx(app, 'test content');

    expect(parseMetadata).toHaveBeenCalledWith(app, 'test content');
    expect(fixFrontmatterMarkdownLinks).toHaveBeenCalledWith(metadata);
    expect(result).toBe(metadata);
  });
});
