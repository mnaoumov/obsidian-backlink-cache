import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  PERFORMANCE_VAULT_FILLER_FOLDER,
  PERFORMANCE_VAULT_LINKER_FOLDER
} from '../scripts/helpers/generate-performance-vault.ts';

/*
 * Real-Obsidian regression guard that the `getCache` patch
 * (src/patches/metadata-cache-get-cache-patch-component.ts) is O(1) per call and does
 * NOT scale with vault size — including for paths that do not resolve to a file.
 *
 * This guards the bulk-deletion fix (see CLAUDE.md "Known Issues"). The patch previously
 * decided canvas routing with `isCanvasFile(app, path)`, which resolves the path via a
 * case-insensitive `getAbstractFileByPath` lookup. That lookup is O(1) on a HIT but does
 * an O(vault) scan on a MISS — and during/after deletion (real or Advanced Exclude's
 * synthetic hide) the path is exactly a miss, so `getCache` became O(vault) per call
 * (measured ~4.5 ms/call at 20k files vs ~0.0005 ms native). The fix routes by the path's
 * `.canvas` extension string instead, so both hits and misses are O(1).
 *
 * The MISSING path below is the case that regressed; run at two scales (BC_PERF_VAULT_SIZE)
 * to confirm flatness. The absolute cap has a wide margin over the observed ~0.001 ms/call
 * and would fire if canvas routing ever went back to resolving the file per call.
 */

const PLUGIN_ID = 'backlink-cache';
const WITH_CACHE_PATH = `${PERFORMANCE_VAULT_LINKER_FOLDER}/link-0.md`;
const MISSING_PATH = `${PERFORMANCE_VAULT_FILLER_FOLDER}/does-not-exist.md`;

const INDEX_WAIT_IN_MS = 240_000;
const INDEX_POLL_IN_MS = 2_000;
const ITERATIONS = 5_000;
const SCENARIO_TIMEOUT_IN_MS = 600_000;

/*
 * Absolute per-call ceiling for the patched `getCache`. Observed ~0.001 ms/call at both
 * 300 and 20k files; this leaves a wide margin while still catching an O(vault) regression.
 */
const MAX_PATCHED_GET_CACHE_PER_CALL_IN_MS = 0.05;

describe('getCache patch per-call overhead', () => {
  it('is O(1) and sub-millisecond in isolation, not scaling with vault size', async () => {
    const result = await evalInObsidian({
      args: {
        INDEX_POLL_IN_MS,
        INDEX_WAIT_IN_MS,
        ITERATIONS,
        MISSING_PATH,
        PLUGIN_ID,
        WITH_CACHE_PATH
      },
      async fn({
        app,
        INDEX_POLL_IN_MS: pollMs,
        INDEX_WAIT_IN_MS: waitMs,
        ITERATIONS: iterations,
        MISSING_PATH: missingPath,
        PLUGIN_ID: pluginId,
        WITH_CACHE_PATH: withCachePath
      }) {
        const metadataCache = app.metadataCache;

        // Wait until Obsidian has indexed the linker note so getCache returns its cache.
        const deadline = Date.now() + waitMs;
        while (!metadataCache.getCache(withCachePath) && Date.now() < deadline) {
          await sleep(pollMs);
        }

        const fileCount = app.vault.getFiles().length;
        const cacheReady = !!metadataCache.getCache(withCachePath);

        // ENABLED: patched getCache.
        const patchedWithCacheMs = measure(() => {
          metadataCache.getCache(withCachePath);
        });
        const patchedMissingMs = measure(() => {
          metadataCache.getCache(missingPath);
        });

        await app.plugins.disablePlugin(pluginId);

        // DISABLED: Obsidian's native getCache.
        const nativeWithCacheMs = measure(() => {
          metadataCache.getCache(withCachePath);
        });
        const nativeMissingMs = measure(() => {
          metadataCache.getCache(missingPath);
        });

        await app.plugins.enablePlugin(pluginId);

        return {
          cacheReady,
          fileCount,
          nativeMissingPerCallMs: nativeMissingMs / iterations,
          nativeWithCachePerCallMs: nativeWithCacheMs / iterations,
          patchedMissingPerCallMs: patchedMissingMs / iterations,
          patchedWithCachePerCallMs: patchedWithCacheMs / iterations
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

    expect(result.cacheReady).toBe(true);

    // eslint-disable-next-line no-console, obsidianmd/rule-custom-message -- Diagnostic breakdown is the point of this troubleshooting harness.
    console.info('[getCache overhead]', {
      fileCount: result.fileCount,
      nativeMissingPerCallMs: result.nativeMissingPerCallMs.toFixed(6),
      nativeWithCachePerCallMs: result.nativeWithCachePerCallMs.toFixed(6),
      patchedMissingPerCallMs: result.patchedMissingPerCallMs.toFixed(6),
      patchedWithCachePerCallMs: result.patchedWithCachePerCallMs.toFixed(6)
    });

    /*
     * The patched getCache is cheap per call regardless of vault size: an O(vault)
     * regression (e.g. a non-cached file scan) would blow past this cap.
     */
    expect(result.patchedWithCachePerCallMs).toBeLessThan(MAX_PATCHED_GET_CACHE_PER_CALL_IN_MS);
    expect(result.patchedMissingPerCallMs).toBeLessThan(MAX_PATCHED_GET_CACHE_PER_CALL_IN_MS);
  }, SCENARIO_TIMEOUT_IN_MS);
});
