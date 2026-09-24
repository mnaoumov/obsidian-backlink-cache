import type { GetBacklinksForFileSafeWrapper } from 'obsidian-dev-utils/obsidian/metadata-cache';

import { evalInObsidian } from 'obsidian-integration-testing';
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
 * Falsified 2026-09-23: with the subscription removed, the canvas is still a backlink source after the
 * disable and this fails.
 */

const CANVAS_PATH = 'canvas-core-plugin-toggle.canvas';
const SETTLE_IN_MS = 3000;
const TARGET_LINK = 'canvas-core-plugin-toggle-target';
const TARGET_PATH = 'canvas-core-plugin-toggle-target.md';
const SCENARIO_TIMEOUT_IN_MS = 120_000;

describe('core Canvas plugin toggle', () => {
  it('drops the canvas from the backlink index on disable and restores it on enable', async () => {
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
          return { isLinkedAfterDisable: true, isLinkedAfterEnable: false, isLinkedBefore: false };
        }

        // `true` is the `isEnabledByUser` argument the Core plugins settings toggle passes.
        corePlugin.disable(true);
        await sleep(settleInMs);
        const isLinkedAfterDisable = await hasCanvasBacklink();

        await corePlugin.enable(true);
        await sleep(settleInMs);
        const isLinkedAfterEnable = await hasCanvasBacklink();

        return {
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
  }, SCENARIO_TIMEOUT_IN_MS);
});
