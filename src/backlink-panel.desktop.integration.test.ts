import type { BacklinkView } from '@obsidian-typings/obsidian-public-latest';

import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * Functional "still useful" guard for the backlink-panel recompute patch
 * (BacklinkComponentRecomputeBacklinkPatchComponent). It is not a perf optimization
 * (its speed derives from getBacklinksForFile, covered by the on/off tripwire) — its
 * job is to render the correct backlinks in the panel from the plugin's index. This
 * test creates a small graph, opens the target's backlinks side panel, recomputes
 * it, and asserts the rendered match count equals the number of linking notes.
 */

const LINKER_COUNT = 5;
// Unique to this test so it never collides with other functional guards.
// Canvas-cache also creates a root `target.md` in this shared temp vault.
const TARGET_BASENAME = 'backlink-panel-target';
const TARGET_PATH = `${TARGET_BASENAME}.md`;
const LINKER_PREFIX = 'backlink-panel-link';
const INDEX_WAIT_IN_MS = 60_000;
const INDEX_POLL_IN_MS = 1000;
const PANEL_SETTLE_IN_MS = 5000;
const SCENARIO_TIMEOUT_IN_MS = 150_000;

describe('backlink panel renders backlinks via the plugin index', () => {
  it('shows the correct match count for the target after recompute', async () => {
    const vaultPath = getTemporaryVault().path;

    /*
     * Creating the graph and waiting for the plugin's index to see it is done from NODE, one short read
     * per attempt, rather than as a deadline loop inside a single `evalInObsidian`. A closure is one
     * transport call, capped at ~30s on this project (`integration-tests:desktop` keeps the default
     * `commandTimeoutInMilliseconds`; only `desktopPerformance` raises it), so a loop declaring 60s could
     * never reach its own ceiling: the call died first and reported a bare `WebDriverError: script
     * timeout` naming only the transport, rather than saying the backlink count never arrived.
     */
    await pollInObsidian({
      input: {
        LINKER_COUNT,
        LINKER_PREFIX,
        TARGET_BASENAME,
        TARGET_PATH
      },
      intervalInMilliseconds: INDEX_POLL_IN_MS,

      poll({ app, TARGET_PATH: targetPath }) {
        const targetFile = app.vault.getFileByPath(targetPath);
        return { backlinkCount: targetFile ? app.metadataCache.getBacklinksForFile(targetFile).keys().length : -1 };
      },

      async start({
        app,
        LINKER_COUNT: linkerCount,
        LINKER_PREFIX: linkerPrefix,
        TARGET_BASENAME: targetBasename,
        TARGET_PATH: targetPath
      }) {
        await app.vault.create(targetPath, '');
        for (let index = 0; index < linkerCount; index++) {
          await app.vault.create(`${linkerPrefix}-${String(index)}.md`, `[[${targetBasename}]]\n`);
        }
      },

      timeoutInMilliseconds: INDEX_WAIT_IN_MS,
      timeoutMessage: `${TARGET_PATH} never reached ${String(LINKER_COUNT)} backlinks in the plugin index`,
      until: (status) => status.backlinkCount >= LINKER_COUNT,
      vaultPath
    });

    /*
     * The panel half declares only the two settles, 10 000 ms in total, so it sits comfortably inside the
     * cap however long the index wait above took.
     */
    const result = await evalInObsidian({
      async callback({
        app,
        PANEL_SETTLE_IN_MS: settleMs,
        TARGET_PATH: targetPath
      }) {
        const targetFile = app.vault.getFileByPath(targetPath);
        if (!targetFile) {
          return { error: 'Target note not found', matchCount: -1, openLeafTypes: [] as string[] };
        }

        const leaf = app.workspace.getLeaf(false);
        await leaf.openFile(targetFile);

        app.internalPlugins.getPluginById('backlink')?.instance.openBacklinksForActiveFile(true);
        await sleep(settleMs);

        const backlinkLeaf = app.workspace.getLeavesOfType('backlink')[0];
        if (!backlinkLeaf) {
          return {
            error: 'No backlink side panel leaf',
            matchCount: -1,
            openLeafTypes: app.workspace.getLeavesOfType('markdown').map((markdownLeaf) => markdownLeaf.view.getViewType())
          };
        }

        const backlinkComponent = (backlinkLeaf.view as BacklinkView).backlink;
        backlinkComponent.recomputeBacklink(targetFile);
        await sleep(settleMs);

        return { error: null, matchCount: backlinkComponent.backlinkDom.getMatchCount(), openLeafTypes: [] as string[] };
      },
      input: {
        PANEL_SETTLE_IN_MS,
        TARGET_PATH
      },
      vaultPath
    });

    expect(result.error).toBeNull();
    // The patched panel renders one match per linking note, sourced from the index.
    expect(result.matchCount).toBe(LINKER_COUNT);
  }, SCENARIO_TIMEOUT_IN_MS);
});
