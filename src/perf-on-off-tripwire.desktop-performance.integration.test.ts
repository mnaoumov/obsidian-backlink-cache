import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  PERFORMANCE_VAULT_LINKER_COUNT,
  PERFORMANCE_VAULT_TARGET
} from '../scripts/helpers/generate-performance-vault.ts';

/*
 * Real-Obsidian on/off tripwire. Each patched operation is timed with the plugin
 * ENABLED (patched) and then DISABLED (Obsidian's native O(vault) implementation),
 * over the same live vault, and the patched path must be substantially faster. This
 * is a tripwire, not a complexity proof (see the deterministic op-count guards in
 * backlink-cache-component.test.ts for that): the day Obsidian fixes its own
 * internal performance, native becomes as fast as patched, the assertion flips, and
 * we are alerted that the patch may no longer be needed.
 */

const PLUGIN_ID = 'backlink-cache';
const INDEX_WAIT_IN_MS = 180_000;
const INDEX_POLL_IN_MS = 2_000;
const SCENARIO_TIMEOUT_IN_MS = 300_000;
const TIMED_ITERATIONS = 100;
// Patched must be at least this many times faster than native to keep the patch worthwhile.
const REQUIRED_SPEEDUP = 2;

describe('plugin on/off perf tripwire', () => {
  it('patched getBacklinksForFile and updateRelatedLinks are much faster than native', async () => {
    const result = await evalInObsidian({
      args: {
        INDEX_POLL_IN_MS,
        INDEX_WAIT_IN_MS,
        LINKER_COUNT: PERFORMANCE_VAULT_LINKER_COUNT,
        PLUGIN_ID,
        TARGET_BASENAME: PERFORMANCE_VAULT_TARGET,
        TIMED_ITERATIONS
      },
      async fn({
        app,
        INDEX_POLL_IN_MS: pollMs,
        INDEX_WAIT_IN_MS: waitMs,
        LINKER_COUNT: linkerCount,
        PLUGIN_ID: pluginId,
        TARGET_BASENAME: targetBasename,
        TIMED_ITERATIONS: iterations
      }) {
        const metadataCache = app.metadataCache;
        const targetFile = app.vault.getFileByPath(targetBasename);
        if (!targetFile) {
          return {
            backlinkCount: -1,
            error: 'Target note not found',
            nativeGetBacklinksMs: -1,
            nativeUpdateRelatedMs: -1,
            patchedGetBacklinksMs: -1,
            patchedUpdateRelatedMs: -1
          };
        }

        const deadline = Date.now() + waitMs;
        let backlinkCount = metadataCache.getBacklinksForFile(targetFile).keys().length;
        while (backlinkCount < linkerCount && Date.now() < deadline) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, pollMs);
          });
          backlinkCount = metadataCache.getBacklinksForFile(targetFile).keys().length;
        }

        const patchedGetBacklinksMs = measure(() => {
          metadataCache.getBacklinksForFile(targetFile);
        });
        const patchedUpdateRelatedMs = measure(() => {
          metadataCache.updateRelatedLinks([targetBasename]);
        });

        await app.plugins.disablePlugin(pluginId);

        const nativeGetBacklinksMs = measure(() => {
          metadataCache.getBacklinksForFile(targetFile);
        });
        const nativeUpdateRelatedMs = measure(() => {
          metadataCache.updateRelatedLinks([targetBasename]);
        });

        await app.plugins.enablePlugin(pluginId);

        return {
          backlinkCount,
          error: null,
          nativeGetBacklinksMs,
          nativeUpdateRelatedMs,
          patchedGetBacklinksMs,
          patchedUpdateRelatedMs
        };

        function measure(action: () => void): number {
          const start = performance.now();
          for (let iteration = 0; iteration < iterations; iteration++) {
            action();
          }
          return performance.now() - start;
        }
      },
      vaultPath: getTempVault().path
    });

    expect(result.error).toBeNull();
    // The patched index was ready before timing.
    expect(result.backlinkCount).toBe(PERFORMANCE_VAULT_LINKER_COUNT);
    // Patched (index) must be substantially faster than native (vault scan) for both ops.
    expect(result.patchedGetBacklinksMs * REQUIRED_SPEEDUP).toBeLessThan(result.nativeGetBacklinksMs);
    expect(result.patchedUpdateRelatedMs * REQUIRED_SPEEDUP).toBeLessThan(result.nativeUpdateRelatedMs);
  }, SCENARIO_TIMEOUT_IN_MS);
});
