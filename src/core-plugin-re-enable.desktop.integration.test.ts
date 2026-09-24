import type { BacklinkView } from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * Guards how this plugin answers the core Backlinks plugin being disabled and enabled again. The pane patch
 * replaces `recomputeBacklink` on the `BacklinkComponent` prototype, which outlives the pane: a disable leaves it
 * installed and an enable reuses the same class. So an enable must install the patch only when it is not already
 * installed - measured in a real Obsidian, patching on every enable stacked one more wrapper per toggle - and must
 * still install it when the core plugin was disabled while this plugin loaded, because then there was no pane to
 * patch until now. Each case fails when its half of the behavior is removed.
 *
 * Each step is its own `evalInObsidian`, because the settle sleeps would otherwise share one per-eval budget.
 * The prototype is kept on `window` between steps: while the core plugin is disabled there is no pane to reach
 * it through.
 */

const PLUGIN_ID = 'backlink-cache';
const NOTE_PATH = 'core-plugin-re-enable-target.md';
const SETTLE_IN_MS = 3000;
const SCENARIO_TIMEOUT_IN_MS = 120_000;

interface BacklinkComponentPrototypeState {
  readonly prototype: Record<string, unknown>;
  recomputeBacklink?: unknown;
}

type Step = 'disableCorePlugin' | 'enableCorePlugin' | 'reloadPlugin' | 'setUp';

interface StepResult {
  readonly isRecomputeBacklinkSameAsRecorded: boolean;
}

async function runStep(step: Step): Promise<StepResult> {
  return await evalInObsidian({
    async callback({
      app,
      NOTE_PATH: notePath,
      PLUGIN_ID: pluginId,
      SETTLE_IN_MS: settleInMs,
      STEP: currentStep
    }): Promise<StepResult> {
      const stateKey = 'coreBacklinksReEnableBacklinkComponentPrototypeState';
      function readState(): BacklinkComponentPrototypeState | undefined {
        return Reflect.get(window, stateKey) as BacklinkComponentPrototypeState | undefined;
      }

      const corePlugin = app.internalPlugins.getPluginById('backlink');
      if (!corePlugin) {
        throw new Error('The core Backlinks plugin is missing.');
      }

      async function getBacklinkView(obsidianApp: App): Promise<BacklinkView | null> {
        const backlinkLeaf = obsidianApp.workspace.getLeavesOfType('backlink')[0];
        if (!backlinkLeaf) {
          return null;
        }
        await backlinkLeaf.loadIfDeferred();
        return backlinkLeaf.view as BacklinkView;
      }

      function readCurrentRecomputeBacklink(): unknown {
        return readState()?.prototype['recomputeBacklink'];
      }

      switch (currentStep) {
        case 'disableCorePlugin': {
          // `true` is the `isEnabledByUser` argument the Core plugins settings toggle passes.
          corePlugin.disable(true);
          await sleep(settleInMs);
          break;
        }
        case 'enableCorePlugin': {
          await corePlugin.enable(true);
          await sleep(settleInMs);
          break;
        }
        case 'reloadPlugin': {
          await app.plugins.disablePlugin(pluginId);
          await app.plugins.enablePlugin(pluginId);
          await sleep(settleInMs);
          break;
        }
        case 'setUp': {
          const file = app.vault.getFileByPath(notePath) ?? await app.vault.create(notePath, '');
          await app.workspace.getLeaf(false).openFile(file);
          corePlugin.instance.openBacklinksForActiveFile(true);
          await sleep(settleInMs);
          const backlinkView = await getBacklinkView(app);
          if (!backlinkView) {
            throw new Error('The backlinks pane did not open.');
          }
          const newState: BacklinkComponentPrototypeState = {
            prototype: Object.getPrototypeOf(backlinkView.backlink) as Record<string, unknown>
          };
          Reflect.set(window, stateKey, newState);
          break;
        }
        default: {
          break;
        }
      }

      const state = readState();
      const isRecomputeBacklinkSameAsRecorded = state?.recomputeBacklink === readCurrentRecomputeBacklink();
      if (state) {
        state.recomputeBacklink = readCurrentRecomputeBacklink();
      }

      return {
        isRecomputeBacklinkSameAsRecorded
      };
    },
    input: {
      NOTE_PATH,
      PLUGIN_ID,
      SETTLE_IN_MS,
      STEP: step
    },
    vaultPath: getTemporaryVault().path
  });
}

describe('core Backlinks plugin re-enable', () => {
  it('does not stack another patch on the backlink prototype on every enable', async () => {
    await runStep('setUp');

    await runStep('disableCorePlugin');
    const afterFirstToggle = await runStep('enableCorePlugin');
    await runStep('disableCorePlugin');
    const afterSecondToggle = await runStep('enableCorePlugin');

    expect(afterFirstToggle.isRecomputeBacklinkSameAsRecorded).toBe(true);
    expect(afterSecondToggle.isRecomputeBacklinkSameAsRecorded).toBe(true);
  }, SCENARIO_TIMEOUT_IN_MS);

  it('patches the pane when the core plugin is enabled after this plugin loaded without it', async () => {
    await runStep('setUp');

    await runStep('disableCorePlugin');
    const afterReloadWithoutCorePlugin = await runStep('reloadPlugin');
    const afterEnable = await runStep('enableCorePlugin');

    // Reloading unloads the patch, so the method changes back to the bare one; the enable must patch it again.
    expect(afterReloadWithoutCorePlugin.isRecomputeBacklinkSameAsRecorded).toBe(false);
    expect(afterEnable.isRecomputeBacklinkSameAsRecorded).toBe(false);
  }, SCENARIO_TIMEOUT_IN_MS);
});
