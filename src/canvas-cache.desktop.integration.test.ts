import { pollInObsidian } from 'obsidian-integration-testing';
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
    /*
     * The wait for the cache to populate is done from NODE, one short read per attempt, rather than as a
     * deadline loop inside a single `evalInObsidian`. A closure is one transport call, capped at ~30s on
     * this project (`integration-tests:desktop` keeps the default `commandTimeoutInMilliseconds`; only
     * `desktopPerformance` raises it), so a loop declaring 60s could never reach its own ceiling: the call
     * died first and reported a bare `WebDriverError: script timeout` naming only the transport, hiding
     * the condition that actually failed. Here the budget lives in Node and the failure names itself.
     */
    const result = await pollInObsidian({
      input: {
        CANVAS_PATH,
        TARGET_LINK,
        TARGET_PATH
      },
      intervalInMilliseconds: CACHE_POLL_IN_MS,

      poll({
        app,
        CANVAS_PATH: canvasPath,
        TARGET_LINK: targetLink,
        TARGET_PATH: targetPath
      }) {
        const cache = app.metadataCache.getCache(canvasPath);
        const resolved = app.metadataCache.resolvedLinks[canvasPath];
        const links = cache?.frontmatterLinks ?? [];
        return {
          hasCache: !!cache,
          hasResolvedTarget: !!resolved && Object.hasOwn(resolved, targetPath),
          hasTargetLink: links.some((link) => link.link === targetLink),
          linkCount: links.length,
          resolvedTargetCount: resolved?.[targetPath] ?? null
        };
      },

      async start({
        app,
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
      },

      timeoutInMilliseconds: CACHE_WAIT_IN_MS,
      timeoutMessage: `the canvas ${CANVAS_PATH} never gained a metadata cache linking to ${TARGET_PATH}`,
      until: (status) => status.hasCache && status.linkCount > 0 && status.hasResolvedTarget,
      vaultPath: getTemporaryVault().path
    });

    // The patch built a metadata cache for the canvas file...
    expect(result.hasCache).toBe(true);
    // ...whose links include the canvas text node's link to the target.
    expect(result.hasTargetLink).toBe(true);
    // Obsidian owns resolvedLinks for canvas natively; the plugin no longer mirrors into it,
    // so the single `[[target]]` reference must resolve to a count of 1, not 2 (double-counted).
    expect(result.resolvedTargetCount).toBe(1);
  }, SCENARIO_TIMEOUT_IN_MS);
});
