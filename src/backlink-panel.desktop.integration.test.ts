import type { BacklinkView } from '@obsidian-typings/obsidian-public-latest';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup';
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
const INDEX_POLL_IN_MS = 1_000;
const PANEL_SETTLE_IN_MS = 5_000;
const SCENARIO_TIMEOUT_IN_MS = 150_000;

describe('backlink panel renders backlinks via the plugin index', () => {
  it('shows the correct match count for the target after recompute', async () => {
    const result = await evalInObsidian({
      args: {
        INDEX_POLL_IN_MS,
        INDEX_WAIT_IN_MS,
        LINKER_COUNT,
        LINKER_PREFIX,
        PANEL_SETTLE_IN_MS,
        TARGET_BASENAME,
        TARGET_PATH
      },
      async fn({
        app,
        INDEX_POLL_IN_MS: pollMs,
        INDEX_WAIT_IN_MS: waitMs,
        LINKER_COUNT: linkerCount,
        LINKER_PREFIX: linkerPrefix,
        PANEL_SETTLE_IN_MS: settleMs,
        TARGET_BASENAME: targetBasename,
        TARGET_PATH: targetPath
      }) {
        await app.vault.create(targetPath, '');
        for (let index = 0; index < linkerCount; index++) {
          await app.vault.create(`${linkerPrefix}-${String(index)}.md`, `[[${targetBasename}]]\n`);
        }

        const targetFile = app.vault.getFileByPath(targetPath);
        if (!targetFile) {
          return { error: 'Target note not found', matchCount: -1, openLeafTypes: [] as string[] };
        }

        const deadline = Date.now() + waitMs;
        let backlinkCount = app.metadataCache.getBacklinksForFile(targetFile).keys().length;
        while (backlinkCount < linkerCount && Date.now() < deadline) {
          await sleep(pollMs);
          backlinkCount = app.metadataCache.getBacklinksForFile(targetFile).keys().length;
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
      vaultPath: getTempVault().path
    });

    expect(result.error).toBeNull();
    // The patched panel renders one match per linking note, sourced from the index.
    expect(result.matchCount).toBe(LINKER_COUNT);
  }, SCENARIO_TIMEOUT_IN_MS);
});
