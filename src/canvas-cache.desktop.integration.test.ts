import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * Functional "still useful" guard for the getCache canvas patch
 * (MetadataCacheGetCachePatchComponent). It is not a perf optimization — it gives
 * canvas files a metadata cache (parsed node links) that Obsidian natively does not
 * provide. This test creates a canvas whose text node links to a target note and
 * asserts metadataCache.getCache for the canvas exposes that link, so a regression
 * that breaks canvas parsing is caught.
 */

const TARGET_PATH = 'target.md';
const CANVAS_PATH = 'diagram.canvas';
const TARGET_LINK = 'target';
const CACHE_WAIT_IN_MS = 60_000;
const CACHE_POLL_IN_MS = 1_000;
const SCENARIO_TIMEOUT_IN_MS = 120_000;

describe('getCache exposes canvas node links', () => {
  it('returns a metadata cache whose links include the canvas text-node link', async () => {
    const result = await evalInObsidian({
      args: {
        CACHE_POLL_IN_MS,
        CACHE_WAIT_IN_MS,
        CANVAS_PATH,
        TARGET_LINK,
        TARGET_PATH
      },
      async fn({
        app,
        CACHE_POLL_IN_MS: pollMs,
        CACHE_WAIT_IN_MS: waitMs,
        CANVAS_PATH: canvasPath,
        TARGET_LINK: targetLink,
        TARGET_PATH: targetPath
      }) {
        await app.vault.create(targetPath, '');
        const canvasContent = JSON.stringify({
          edges: [],
          nodes: [{ height: 100, id: 'node-1', text: `[[${targetLink}]]`, type: 'text', width: 200, x: 0, y: 0 }]
        });
        await app.vault.create(canvasPath, canvasContent);

        const deadline = Date.now() + waitMs;
        let cache = app.metadataCache.getCache(canvasPath);
        while ((!cache || (cache.frontmatterLinks?.length ?? 0) === 0) && Date.now() < deadline) {
          await sleep(pollMs);
          cache = app.metadataCache.getCache(canvasPath);
        }

        const links = cache?.frontmatterLinks ?? [];
        return {
          error: null,
          hasCache: !!cache,
          hasTargetLink: links.some((link) => link.link === targetLink),
          linkCount: links.length
        };
      },
      vaultPath: getTempVault().path
    });

    expect(result.error).toBeNull();
    // The patch built a metadata cache for the canvas file...
    expect(result.hasCache).toBe(true);
    // ...whose links include the canvas text node's link to the target.
    expect(result.hasTargetLink).toBe(true);
  }, SCENARIO_TIMEOUT_IN_MS);
});
