import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  PERFORMANCE_VAULT_LINKER_COUNT,
  PERFORMANCE_VAULT_LINKER_FOLDER,
  PERFORMANCE_VAULT_TARGET
} from '../scripts/helpers/generate-performance-vault.ts';

/*
 * Real-Obsidian regression guard for the `updateRelatedLinks` O(N²) fix. Obsidian's
 * original `updateRelatedLinks` scans every cached file via `getCachedFiles` per
 * changed name, which makes a bulk folder delete O(N²). With `backlink-cache`
 * loaded, the method is patched to consult the plugin's basename index, so it must
 * NOT call `getCachedFiles` at all and must queue exactly the files that link to the
 * changed name — O(matches), not O(vault). The vault has one target note,
 * `PERFORMANCE_VAULT_LINKER_COUNT` notes that link to it, and a large filler folder
 * (default 90k, override with `BC_PERF_VAULT_SIZE`) whose files must be ignored.
 */

const LINKER_PREFIX = `${PERFORMANCE_VAULT_LINKER_FOLDER}/`;

/*
 * Deadline for Obsidian's startup scan and backlink-cache's initial processAllNotes to
 * finish indexing the vault before we probe updateRelatedLinks. We POLL the target's
 * backlink count up to this deadline rather than sleeping a fixed interval: at 90k the
 * initial index alone takes ~50s, so a fixed wait races the index and intermittently
 * reads an empty cache. Mirrors the poll in the bulk-delete / getCache-overhead harnesses.
 */
const INDEX_WAIT_IN_MS = 240_000;
const INDEX_POLL_IN_MS = 2_000;
const SCENARIO_TIMEOUT_IN_MS = 300_000;

describe('updateRelatedLinks avoids the vault scan', () => {
  it('queues only the linking files and never calls getCachedFiles', async () => {
    const result = await evalInObsidian({
      args: {
        EXPECTED_LINKER_COUNT: PERFORMANCE_VAULT_LINKER_COUNT,
        INDEX_POLL_IN_MS,
        INDEX_WAIT_IN_MS,
        LINKER_PREFIX,
        TARGET_BASENAME: PERFORMANCE_VAULT_TARGET
      },
      async fn({
        app,
        EXPECTED_LINKER_COUNT: expectedLinkerCount,
        INDEX_POLL_IN_MS: pollMs,
        INDEX_WAIT_IN_MS: waitMs,
        LINKER_PREFIX: linkerPrefix,
        TARGET_BASENAME: targetBasename
      }) {
        const metadataCache = app.metadataCache;
        const targetFile = app.vault.getFileByPath(targetBasename);
        if (!targetFile) {
          return { backlinkCount: -1, error: 'Target note not found', getCachedFilesCalls: -1, queuedLinkerCount: -1, queuedTotal: -1 };
        }

        /*
         * Poll until the initial index has populated the target's backlinks; a fixed
         * wait races the ~50s index at 90k and can read an empty cache.
         */
        let backlinkCount = metadataCache.getBacklinksForFile(targetFile).keys().length;
        const deadline = Date.now() + waitMs;
        while (backlinkCount < expectedLinkerCount && Date.now() < deadline) {
          await sleep(pollMs);
          backlinkCount = metadataCache.getBacklinksForFile(targetFile).keys().length;
        }

        const originalGetCachedFiles = metadataCache.getCachedFiles.bind(metadataCache);
        const originalQueueFileForLinkResolution = metadataCache.queueFileForLinkResolution.bind(metadataCache);
        let getCachedFilesCalls = 0;
        const queuedPaths: string[] = [];
        metadataCache.getCachedFiles = (): string[] => {
          getCachedFilesCalls++;
          return originalGetCachedFiles();
        };
        metadataCache.queueFileForLinkResolution = (file): void => {
          if (file) {
            queuedPaths.push(file.path);
          }
          originalQueueFileForLinkResolution(file);
        };

        try {
          metadataCache.updateRelatedLinks([targetBasename]);
        } finally {
          metadataCache.getCachedFiles = originalGetCachedFiles;
          metadataCache.queueFileForLinkResolution = originalQueueFileForLinkResolution;
        }

        return {
          backlinkCount,
          error: null,
          getCachedFilesCalls,
          queuedLinkerCount: queuedPaths.filter((path) => path.startsWith(linkerPrefix)).length,
          queuedTotal: queuedPaths.length
        };
      },
      vaultPath: getTempVault().path
    });

    expect(result.error).toBeNull();
    // Backlink-cache indexed every note that links to the target.
    expect(result.backlinkCount).toBe(PERFORMANCE_VAULT_LINKER_COUNT);
    // The patched updateRelatedLinks did NOT scan the vault.
    expect(result.getCachedFilesCalls).toBe(0);
    // It queued exactly the linking notes — nothing from the large filler folder.
    expect(result.queuedLinkerCount).toBe(PERFORMANCE_VAULT_LINKER_COUNT);
    expect(result.queuedTotal).toBe(PERFORMANCE_VAULT_LINKER_COUNT);
  }, SCENARIO_TIMEOUT_IN_MS);
});
