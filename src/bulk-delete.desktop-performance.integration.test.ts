import type { CachedMetadata } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  PERFORMANCE_VAULT_DELETE_COUNT,
  PERFORMANCE_VAULT_DELETE_FOLDER_A,
  PERFORMANCE_VAULT_DELETE_FOLDER_B,
  PERFORMANCE_VAULT_DELETE_TARGET
} from '../scripts/helpers/generate-performance-vault.ts';

// Every note in both delete folders links to delete-target, so once the initial index finishes it has one backlink per note: PERFORMANCE_VAULT_DELETE_COUNT from each of the two folders.
const EXPECTED_DELETE_TARGET_BACKLINKS = PERFORMANCE_VAULT_DELETE_COUNT * 2;

/*
 * Real-Obsidian bulk-deletion troubleshooting harness for the documented freeze
 * (see CLAUDE.md "Known Issues"). When a large folder is removed, Obsidian runs its
 * internal delete cascade once per descendant file and, per file, its
 * `MetadataCache.onDelete` reads the file's cache via `getCache` — the method this
 * plugin patches. The open question is WHERE the per-file time goes: the plugin's
 * `getCache` patch handler, Obsidian's own native delete work reached through the
 * patch's `fallback()`, or the plugin's deferred debounced reverse-index batch.
 *
 * This test localizes it by deleting two identical folders of linking notes — folder
 * A with the plugin ENABLED (patched `getCache`) and folder B with it DISABLED
 * (Obsidian's native `getCache`) — while instrumenting:
 *   - the synchronous delete-cascade wall time for each (enabled vs native),
 *   - the number of `getCache` calls and cumulative time inside `getCache` for each,
 *   - the main-thread blocking caused by the plugin's deferred debounced batch,
 *     measured as how far a post-loop timer overruns its scheduled deadline.
 *
 * It is a diagnostic harness first (it logs a full per-file breakdown) and a tripwire
 * second: the assertions only lock in the call-path invariants and a generous bound
 * on the plugin's per-delete synchronous overhead, so the numbers can be read from CI
 * output without the test flapping on absolute timings.
 */

const PLUGIN_ID = 'backlink-cache';
const DELETE_FOLDER_A_PREFIX = `${PERFORMANCE_VAULT_DELETE_FOLDER_A}/`;
const DELETE_FOLDER_B_PREFIX = `${PERFORMANCE_VAULT_DELETE_FOLDER_B}/`;

/*
 * Obsidian's startup scan and backlink-cache's initial processAllNotes must finish
 * indexing the vault before we probe deletion. At 90k scale this can take minutes, so
 * we poll the delete-target's backlink count up to this deadline rather than guessing
 * a fixed settle time.
 */
const INDEX_WAIT_IN_MS = 240_000;
const INDEX_POLL_IN_MS = 2_000;
/*
 * Mirror of the plugin's internal debounce interval (BacklinkCacheComponent
 * INTERVAL_IN_MILLISECONDS). The deferred reverse-index batch fires this long after
 * the last delete; we wait past it to capture the batch's main-thread blocking.
 */
const PLUGIN_DEBOUNCE_IN_MS = 500;
/*
 * Extra wait beyond the debounce so the deferred batch has surely started before the
 * observation timer's deadline. The blocking measurement therefore undercounts the
 * batch by at most this much (the portion that runs before the deadline) — acceptable
 * for localization.
 */
const DEFERRED_MARGIN_IN_MS = 500;
const SCENARIO_TIMEOUT_IN_MS = 600_000;

/*
 * The plugin must not add more than this multiple of Obsidian's own native
 * per-delete cost to the synchronous cascade. Generous on purpose: this is the
 * tripwire that fires if the `getCache` patch ever starts doing heavy per-delete
 * work synchronously (the failure mode the Known Issue hypothesizes).
 */
const MAX_SYNC_OVERHEAD_FACTOR = 3;

/*
 * The plugin's deferred debounced reverse-index batch must stay well under a
 * perceptible freeze. The original Known Issue blamed "heavy reverse-index work per
 * deleted file"; this bounds that batch's main-thread blocking and would fire if the
 * remove path ever stopped being a cheap incremental drop.
 */
const MAX_DEFERRED_BLOCK_IN_MS = 2_000;

describe('bulk-delete cascade cost breakdown', () => {
  it('localizes the per-deleted-file cost across the patched getCache, native getCache, and the deferred batch', async () => {
    const result = await evalInObsidian({
      args: {
        DEFERRED_MARGIN_IN_MS,
        DELETE_FOLDER_A_PREFIX,
        DELETE_FOLDER_B_PREFIX,
        DELETE_TARGET: PERFORMANCE_VAULT_DELETE_TARGET,
        EXPECTED_DELETE_TARGET_BACKLINKS,
        INDEX_POLL_IN_MS,
        INDEX_WAIT_IN_MS,
        PLUGIN_DEBOUNCE_IN_MS,
        PLUGIN_ID
      },
      async fn({
        app,
        DEFERRED_MARGIN_IN_MS: deferredMarginMs,
        DELETE_FOLDER_A_PREFIX: folderAPrefix,
        DELETE_FOLDER_B_PREFIX: folderBPrefix,
        DELETE_TARGET: deleteTargetPath,
        EXPECTED_DELETE_TARGET_BACKLINKS: expectedBacklinks,
        INDEX_POLL_IN_MS: pollMs,
        INDEX_WAIT_IN_MS: waitMs,
        PLUGIN_DEBOUNCE_IN_MS: debounceMs,
        PLUGIN_ID: pluginId
      }) {
        const metadataCache = app.metadataCache;
        const deleteTargetFile = app.vault.getFileByPath(deleteTargetPath);
        const filesA = app.vault.getFiles().filter((file) => file.path.startsWith(folderAPrefix));
        const filesB = app.vault.getFiles().filter((file) => file.path.startsWith(folderBPrefix));

        // The plugin must have indexed every linking note before timing starts.
        // Poll the delete-target's backlink count until it is fully populated.
        let deleteTargetBacklinkCount = -1;
        if (deleteTargetFile) {
          deleteTargetBacklinkCount = metadataCache.getBacklinksForFile(deleteTargetFile).keys().length;
          const deadline = Date.now() + waitMs;
          while (deleteTargetBacklinkCount < expectedBacklinks && Date.now() < deadline) {
            await sleep(pollMs);
            deleteTargetBacklinkCount = metadataCache.getBacklinksForFile(deleteTargetFile).keys().length;
          }
        }

        // ENABLED: time the synchronous cascade over folder A through the patched getCache.
        let enabledGetCacheCalls = 0;
        let enabledGetCacheMs = 0;
        const enabledOriginalGetCache = metadataCache.getCache;
        metadataCache.getCache = (cachePath: string): CachedMetadata | null => {
          enabledGetCacheCalls++;
          const startMs = performance.now();
          const cache = enabledOriginalGetCache.call(metadataCache, cachePath);
          enabledGetCacheMs += performance.now() - startMs;
          return cache;
        };

        const enabledSyncStartMs = performance.now();
        for (const file of filesA) {
          // eslint-disable-next-line obsidianmd/prefer-file-manager-trash-file -- The harness reproduces Obsidian's internal removeFile cascade and needs deterministic permanent deletion, not user-preference trashing.
          await app.vault.delete(file, true);
        }
        const enabledSyncMs = performance.now() - enabledSyncStartMs;

        metadataCache.getCache = enabledOriginalGetCache;

        /*
         * Measure the plugin's deferred debounced batch as main-thread blocking: the
         * batch fires ~debounceMs after the last delete and processes every pending
         * remove synchronously, overrunning this timer's scheduled deadline.
         */
        const deferredScheduledMs = debounceMs + deferredMarginMs;
        const deferredStartMs = performance.now();
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, deferredScheduledMs);
        });
        const enabledDeferredBlockMs = Math.max(0, performance.now() - deferredStartMs - deferredScheduledMs);

        // DISABLED: time the identical cascade over folder B through native getCache.
        await app.plugins.disablePlugin(pluginId);

        let disabledGetCacheCalls = 0;
        let disabledGetCacheMs = 0;
        const disabledOriginalGetCache = metadataCache.getCache;
        metadataCache.getCache = (cachePath: string): CachedMetadata | null => {
          disabledGetCacheCalls++;
          const startMs = performance.now();
          const cache = disabledOriginalGetCache.call(metadataCache, cachePath);
          disabledGetCacheMs += performance.now() - startMs;
          return cache;
        };

        const disabledSyncStartMs = performance.now();
        for (const file of filesB) {
          // eslint-disable-next-line obsidianmd/prefer-file-manager-trash-file -- The harness reproduces Obsidian's internal removeFile cascade and needs deterministic permanent deletion, not user-preference trashing.
          await app.vault.delete(file, true);
        }
        const disabledSyncMs = performance.now() - disabledSyncStartMs;

        metadataCache.getCache = disabledOriginalGetCache;

        await app.plugins.enablePlugin(pluginId);

        return {
          deletedA: filesA.length,
          deletedB: filesB.length,
          deleteTargetBacklinkCount,
          disabledGetCacheCalls,
          disabledGetCacheMs,
          disabledSyncMs,
          enabledDeferredBlockMs,
          enabledGetCacheCalls,
          enabledGetCacheMs,
          enabledSyncMs,
          error: null
        };
      },
      vaultPath: getTempVault().path
    });

    expect(result.error).toBeNull();

    // Both folders were fully populated and fully deleted.
    expect(result.deletedA).toBe(PERFORMANCE_VAULT_DELETE_COUNT);
    expect(result.deletedB).toBe(PERFORMANCE_VAULT_DELETE_COUNT);
    // The plugin indexed every linking note in both folders before deletion.
    expect(result.deleteTargetBacklinkCount).toBe(EXPECTED_DELETE_TARGET_BACKLINKS);

    /*
     * Documented call path: Obsidian reads each deleted file's cache via getCache, so
     * there is at least one getCache call per deleted file — patched and native alike.
     */
    expect(result.enabledGetCacheCalls).toBeGreaterThanOrEqual(result.deletedA);
    expect(result.disabledGetCacheCalls).toBeGreaterThanOrEqual(result.deletedB);

    const enabledSyncPerFileMs = result.enabledSyncMs / result.deletedA;
    const disabledSyncPerFileMs = result.disabledSyncMs / result.deletedB;
    const enabledGetCachePerCallMs = result.enabledGetCacheMs / result.enabledGetCacheCalls;
    const disabledGetCachePerCallMs = result.disabledGetCacheMs / result.disabledGetCacheCalls;

    // eslint-disable-next-line no-console, obsidianmd/rule-custom-message -- Diagnostic breakdown is the point of this troubleshooting harness.
    console.info('[bulk-delete breakdown]', {
      deletedPerFolder: result.deletedA,
      disabledGetCachePerCallMs: disabledGetCachePerCallMs.toFixed(4),
      disabledGetCacheTotalMs: result.disabledGetCacheMs.toFixed(1),
      disabledSyncMs: result.disabledSyncMs.toFixed(1),
      disabledSyncPerFileMs: disabledSyncPerFileMs.toFixed(4),
      enabledDeferredBlockMs: result.enabledDeferredBlockMs.toFixed(1),
      enabledGetCachePerCallMs: enabledGetCachePerCallMs.toFixed(4),
      enabledGetCacheTotalMs: result.enabledGetCacheMs.toFixed(1),
      enabledSyncMs: result.enabledSyncMs.toFixed(1),
      enabledSyncPerFileMs: enabledSyncPerFileMs.toFixed(4),
      syncOverheadFactor: (enabledSyncPerFileMs / disabledSyncPerFileMs).toFixed(2)
    });

    /*
     * Tripwire: the patched cascade must not be dramatically slower per file than the
     * native one. If this fires, the getCache patch has started doing heavy per-delete
     * work synchronously and the bulk-delete freeze is the plugin's own fault.
     */
    expect(enabledSyncPerFileMs).toBeLessThan(disabledSyncPerFileMs * MAX_SYNC_OVERHEAD_FACTOR);

    /*
     * Tripwire: the deferred reverse-index batch must not block the main thread for a
     * perceptible time — it is an incremental per-path drop, not a rebuild.
     */
    expect(result.enabledDeferredBlockMs).toBeLessThan(MAX_DEFERRED_BLOCK_IN_MS);
  }, SCENARIO_TIMEOUT_IN_MS);
});
