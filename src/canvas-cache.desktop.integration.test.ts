import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * Functional "still useful" guard for the getCache canvas patch
 * (MetadataCacheGetCachePatchComponent). It is not a perf optimization — it gives
 * canvas files a metadata cache (parsed node links) that Obsidian natively does not
 * provide (Obsidian resolves canvas backlinks natively since 1.12.4 but still leaves the
 * per-file getCache empty for canvas files). This test creates a canvas whose text node
 * links to a target note and asserts metadataCache.getCache for the canvas exposes that
 * link, so a regression that breaks canvas parsing is caught.
 *
 * It also asserts resolvedLinks for the canvas is NOT double-counted: Obsidian owns
 * resolvedLinks/unresolvedLinks for canvas natively, and the plugin must not mirror into
 * them on top (which would inflate the count from 1 to 2).
 */

const TARGET_PATH = 'target.md';
const CANVAS_PATH = 'diagram.canvas';
const TARGET_LINK = 'target';
const CACHE_WAIT_IN_MS = 60_000;
const CACHE_POLL_IN_MS = 1000;
const SCENARIO_TIMEOUT_IN_MS = 120_000;

describe('getCache exposes canvas node links', () => {
  it('returns a metadata cache whose links include the canvas text-node link', async () => {
    const result = await evalInObsidian({
      async callback({
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
        let resolved = app.metadataCache.resolvedLinks[canvasPath];
        while (
          (!cache || (cache.frontmatterLinks?.length ?? 0) === 0 || !resolved || !Object.hasOwn(resolved, targetPath))
          && Date.now() < deadline
        ) {
          await sleep(pollMs);
          cache = app.metadataCache.getCache(canvasPath);
          resolved = app.metadataCache.resolvedLinks[canvasPath];
        }

        const links = cache?.frontmatterLinks ?? [];
        return {
          error: null,
          hasCache: !!cache,
          hasTargetLink: links.some((link) => link.link === targetLink),
          linkCount: links.length,
          resolvedTargetCount: resolved?.[targetPath] ?? null
        };
      },
      input: {
        CACHE_POLL_IN_MS,
        CACHE_WAIT_IN_MS,
        CANVAS_PATH,
        TARGET_LINK,
        TARGET_PATH
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.error).toBeNull();
    // The patch built a metadata cache for the canvas file...
    expect(result.hasCache).toBe(true);
    // ...whose links include the canvas text node's link to the target.
    expect(result.hasTargetLink).toBe(true);
    // Obsidian owns resolvedLinks for canvas natively; the plugin no longer mirrors into it,
    // So the single `[[target]]` reference must resolve to a count of 1, not 2 (double-counted).
    expect(result.resolvedTargetCount).toBe(1);
  }, SCENARIO_TIMEOUT_IN_MS);
});
