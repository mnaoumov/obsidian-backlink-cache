import type { BacklinkView } from '@obsidian-typings/obsidian-public-latest';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * Guards the signal this plugin learns "the core Backlinks plugin came back" from. It used to be a monkey
 * patch of `onUserEnable` on the `BacklinkPluginInstance` prototype; it is now a subscription to the
 * `change` event Obsidian raises on `app.internalPlugins`. What this asserts is that the signal still
 * arrives in a real Obsidian and still reaches `patchBacklinksPane` - the whole reason either mechanism
 * exists - measured across a real disable/enable of the core plugin rather than against a mock.
 *
 * The observable is the identity of `recomputeBacklink` on the `BacklinkComponent` prototype, which
 * `BacklinkComponentRecomputeBacklinkPatchComponent` replaces. Opening the pane by hand does not patch it -
 * only the enable path does - so the reference has to CHANGE across the toggle. It deliberately claims
 * nothing about what the pane would render without the re-patch: the patch sits on a prototype the whole
 * vault shares and is never removed on disable, so the previous wrapper may well still be doing the work.
 * Falsified 2026-09-23: with the subscription removed the reference is unchanged and this fails.
 */

const NOTE_PATH = 'core-plugin-re-enable-target.md';
const SETTLE_IN_MS = 3000;
const SCENARIO_TIMEOUT_IN_MS = 120_000;

describe('core Backlinks plugin re-enable', () => {
  it('patches the reopened backlinks pane again', async () => {
    const vaultPath = getTemporaryVault().path;

    const result = await evalInObsidian({
      async callback({
        app,
        NOTE_PATH: notePath,
        SETTLE_IN_MS: settleInMs
      }) {
        async function readRecomputeBacklink(): Promise<unknown> {
          const backlinkLeaf = app.workspace.getLeavesOfType('backlink')[0];
          if (!backlinkLeaf) {
            return null;
          }

          await backlinkLeaf.loadIfDeferred();
          const backlinkComponent = (backlinkLeaf.view as BacklinkView).backlink;
          const backlinkComponentPrototype = Object.getPrototypeOf(backlinkComponent) as Record<string, unknown>;
          return backlinkComponentPrototype['recomputeBacklink'] ?? null;
        }

        const file = app.vault.getFileByPath(notePath) ?? await app.vault.create(notePath, '');
        await app.workspace.getLeaf(false).openFile(file);

        const corePlugin = app.internalPlugins.getPluginById('backlink');
        if (!corePlugin) {
          return { hasAfter: false, hasBefore: false, isChanged: false };
        }

        corePlugin.instance.openBacklinksForActiveFile(true);
        await sleep(settleInMs);
        const before = await readRecomputeBacklink();

        // `true` is the `isEnabledByUser` argument the Core plugins settings toggle passes.
        corePlugin.disable(true);
        await sleep(settleInMs);
        await corePlugin.enable(true);
        await sleep(settleInMs);
        const after = await readRecomputeBacklink();

        return {
          hasAfter: after !== null,
          hasBefore: before !== null,
          isChanged: before !== after
        };
      },
      input: {
        NOTE_PATH,
        SETTLE_IN_MS
      },
      vaultPath
    });

    expect(result.hasBefore).toBe(true);
    expect(result.hasAfter).toBe(true);
    expect(result.isChanged).toBe(true);
  }, SCENARIO_TIMEOUT_IN_MS);
});
