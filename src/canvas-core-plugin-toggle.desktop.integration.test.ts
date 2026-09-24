import type { GetBacklinksForFileSafeWrapper } from 'obsidian-dev-utils/obsidian/metadata-cache';

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
 * Guards the signal this plugin learns "the core Canvas plugin was toggled" from. It used to be two monkey
 * patches - `onUserEnable` and `onUserDisable` on the `CanvasPluginInstance` prototype, an object every vault
 * shares; it is now one subscription to the `change` event Obsidian raises on `app.internalPlugins`. What
 * this asserts is that BOTH directions still arrive in a real Obsidian and still reach
 * `onCanvasCorePluginDisable` and `onCanvasCorePluginEnable` - the whole reason either mechanism exists -
 * measured across a real disable/enable of the core plugin rather than against a mock.
 *
 * The observable is the plugin's own backlink index, read through the `safe` wrapper so no pending action is
 * raced: a canvas file linking to a note is one of that note's backlink sources. Disabling canvas runs
 * `removeCanvasMetadataCache`, which drops the canvas from the index; enabling it runs
 * `processAllCanvasFiles`, which puts it back. The synthetic `getCache` entry is deliberately NOT the
 * observable - the per-path map outlives a disable, so it cannot tell the two states apart.
 * It also asserts that a canvas created after the toggle still gets native `resolvedLinks`, which Obsidian breaks on
 * its own and `repairCanvasIndex` puts back.
 * Falsified 2026-09-23: with the subscription removed, the canvas is still a backlink source after the
 * disable and this fails. Falsified 2026-09-24: with `repairCanvasIndex` made a no-op, the canvas index is still
 * unloaded after the enable and this fails.
 */

const CANVAS_PATH = 'canvas-core-plugin-toggle.canvas';
const LATE_CANVAS_PATH = 'canvas-core-plugin-toggle-late.canvas';
const POLL_IN_MS = 1000;
const RESOLVE_WAIT_IN_MS = 60_000;
const SETTLE_IN_MS = 3000;
const TARGET_LINK = 'canvas-core-plugin-toggle-target';
const TARGET_PATH = 'canvas-core-plugin-toggle-target.md';
const SCENARIO_TIMEOUT_IN_MS = 180_000;

describe('core Canvas plugin toggle', () => {
  it('drops the canvas from the backlink index on disable, restores it on enable, and keeps new canvases resolving', async () => {
    const vaultPath = getTemporaryVault().path;

    const result = await evalInObsidian({
      async callback({
        app,
        CANVAS_PATH: canvasPath,
        SETTLE_IN_MS: settleInMs,
        TARGET_LINK: targetLink,
        TARGET_PATH: targetPath
      }) {
        async function hasCanvasBacklink(): Promise<boolean> {
          const targetFile = app.vault.getFileByPath(targetPath);
          if (!targetFile) {
            return false;
          }

          const getBacklinksForFile = app.metadataCache.getBacklinksForFile as GetBacklinksForFileSafeWrapper & typeof app.metadataCache.getBacklinksForFile;
          const backlinks = await getBacklinksForFile.safe(targetFile);
          return backlinks.keys().includes(canvasPath);
        }

        await app.vault.create(targetPath, '');
        await app.vault.create(
          canvasPath,
          JSON.stringify({
            edges: [],
            nodes: [{ height: 100, id: 'node-1', text: `[[${targetLink}]]`, type: 'text', width: 200, x: 0, y: 0 }]
          })
        );
        await sleep(settleInMs);
        const isLinkedBefore = await hasCanvasBacklink();

        const corePlugin = app.internalPlugins.getPluginById('canvas');
        if (!corePlugin) {
          return { isCanvasIndexLoadedAfterEnable: false, isLinkedAfterDisable: true, isLinkedAfterEnable: false, isLinkedBefore: false };
        }

        // `true` is the `isEnabledByUser` argument the Core plugins settings toggle passes.
        corePlugin.disable(true);
        await sleep(settleInMs);
        const isLinkedAfterDisable = await hasCanvasBacklink();

        await corePlugin.enable(true);
        await sleep(settleInMs);
        const isLinkedAfterEnable = await hasCanvasBacklink();

        const isCanvasIndexLoadedAfterEnable = corePlugin.instance.index._loaded;

        return {
          isCanvasIndexLoadedAfterEnable,
          isLinkedAfterDisable,
          isLinkedAfterEnable,
          isLinkedBefore
        };
      },
      input: {
        CANVAS_PATH,
        SETTLE_IN_MS,
        TARGET_LINK,
        TARGET_PATH
      },
      vaultPath
    });

    expect(result.isLinkedBefore).toBe(true);
    expect(result.isLinkedAfterDisable).toBe(false);
    expect(result.isLinkedAfterEnable).toBe(true);

    /*
     * Obsidian's own defect, measured in 1.14.2 with this plugin disabled: the disable unloads the canvas index and
     * the enable never loads that same object again, so a canvas created afterwards gets no native `resolvedLinks`.
     * The plugin loads the index back on the enable edge. The late canvas is the symptom: the index can only resolve
     * it if it is loaded again. Its wait lives in Node, one short read per attempt, because the index resolves on its
     * own schedule and a loaded machine stretches it past a fixed sleep.
     */
    expect(result.isCanvasIndexLoadedAfterEnable).toBe(true);
    const lateCanvasStatus = await pollInObsidian({
      input: {
        LATE_CANVAS_PATH,
        TARGET_LINK,
        TARGET_PATH
      },
      intervalInMilliseconds: POLL_IN_MS,
      poll({ app, LATE_CANVAS_PATH: lateCanvasPath, TARGET_PATH: targetPath }) {
        return { resolvedTargetCount: app.metadataCache.resolvedLinks[lateCanvasPath]?.[targetPath] ?? null };
      },
      async start({ app, LATE_CANVAS_PATH: lateCanvasPath, TARGET_LINK: targetLink }) {
        await app.vault.create(
          lateCanvasPath,
          JSON.stringify({
            edges: [],
            nodes: [{ height: 100, id: 'node-1', text: `[[${targetLink}]]`, type: 'text', width: 200, x: 0, y: 0 }]
          })
        );
      },
      timeoutInMilliseconds: RESOLVE_WAIT_IN_MS,
      timeoutMessage: `the canvas ${LATE_CANVAS_PATH}, created after the toggle, never resolved its link to ${TARGET_PATH}`,
      until: (status) => status.resolvedTargetCount !== null,
      vaultPath
    });
    expect(lateCanvasStatus.resolvedTargetCount).toBe(1);
  }, SCENARIO_TIMEOUT_IN_MS);
});
