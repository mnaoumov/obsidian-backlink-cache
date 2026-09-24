import type { BacklinkView } from '@obsidian-typings/obsidian-public-latest';
import type {
  MarkdownView,
  WorkspaceLeaf
} from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest';

/*
 * Guards loading this plugin while the core Backlinks plugin is enabled but its pane is closed - an ordinary state,
 * since the pane is only a sidebar tab. The patch replaces `recomputeBacklink` on a prototype this plugin can only
 * reach through a backlinks component on screen, so there is nothing to patch at load. Measured in a real Obsidian
 * 1.14.2 before the fix: reopening the pane left the bare method in place until a restart with the pane open.
 *
 * Each step is its own `evalInObsidian`, because the settle sleeps would otherwise share one per-eval budget. The
 * prototype is kept on `window` between steps, since with the pane closed there is nothing to reach it through.
 * Every case leaves the pane open again, since the suites share one vault and the next one expects it there.
 */

const PLUGIN_ID = 'backlink-cache';
const NOTE_PATH = 'closed-backlinks-pane-target.md';
const SETTLE_IN_MS = 3000;
const SCENARIO_TIMEOUT_IN_MS = 120_000;

interface BacklinkComponentPrototypeState {
  readonly prototype: Record<string, unknown>;
  recomputeBacklink?: unknown;
}

type Step =
  | 'closePaneAndReloadPlugin'
  | 'disableBacklinksInDocument'
  | 'enableBacklinksInDocument'
  | 'openPane'
  | 'setUp';

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
      const stateKey = 'closedBacklinksPaneBacklinkComponentPrototypeState';
      function readState(): BacklinkComponentPrototypeState | undefined {
        return Reflect.get(window, stateKey) as BacklinkComponentPrototypeState | undefined;
      }

      const corePlugin = app.internalPlugins.getPluginById('backlink');
      if (!corePlugin) {
        throw new Error('The core Backlinks plugin is missing.');
      }
      const backlinkPluginInstance = corePlugin.instance;

      function getNoteLeaf(): undefined | WorkspaceLeaf {
        return app.workspace.getLeavesOfType('markdown').find((leaf) => (leaf.view as MarkdownView).file?.path === notePath);
      }

      /*
       * In-document backlinks are toggled per note view, for the active one - the command palette's
       * "Toggle backlinks in document" - not through the plugin options.
       */
      async function setBacklinksInDocument(isEnabled: boolean): Promise<void> {
        const noteLeaf = getNoteLeaf();
        if (!noteLeaf) {
          throw new Error('The note is not open.');
        }
        const isShown = Boolean((noteLeaf.view as MarkdownView).backlinks);
        if (isShown === isEnabled) {
          return;
        }
        app.workspace.setActiveLeaf(noteLeaf, { focus: true });
        backlinkPluginInstance.toggleBacklinksInDocument(false);
        await sleep(settleInMs);
      }

      async function openPane(): Promise<BacklinkView> {
        if (app.workspace.getLeavesOfType('backlink').length === 0) {
          await app.workspace.getRightLeaf(false)?.setViewState({ active: true, type: 'backlink' });
          await sleep(settleInMs);
        }
        const backlinkLeaf = app.workspace.getLeavesOfType('backlink')[0];
        if (!backlinkLeaf) {
          throw new Error('The backlinks pane did not open.');
        }
        await backlinkLeaf.loadIfDeferred();
        return backlinkLeaf.view as BacklinkView;
      }

      switch (currentStep) {
        case 'closePaneAndReloadPlugin': {
          for (const backlinkLeaf of app.workspace.getLeavesOfType('backlink')) {
            backlinkLeaf.detach();
          }
          await app.plugins.disablePlugin(pluginId);
          await app.plugins.enablePlugin(pluginId);
          await sleep(settleInMs);
          break;
        }
        case 'disableBacklinksInDocument': {
          await setBacklinksInDocument(false);
          break;
        }
        case 'enableBacklinksInDocument': {
          await setBacklinksInDocument(true);
          break;
        }
        case 'openPane': {
          await openPane();
          break;
        }
        case 'setUp': {
          const noteFile = app.vault.getFileByPath(notePath) ?? await app.vault.create(notePath, '');
          await app.workspace.getLeaf(false).openFile(noteFile);
          const backlinkView = await openPane();
          const state: BacklinkComponentPrototypeState = {
            prototype: Object.getPrototypeOf(backlinkView.backlink) as Record<string, unknown>
          };
          Reflect.set(window, stateKey, state);
          break;
        }
        default: {
          break;
        }
      }

      const state = readState();
      const currentRecomputeBacklink = state?.prototype['recomputeBacklink'];
      const isRecomputeBacklinkSameAsRecorded = state?.recomputeBacklink === currentRecomputeBacklink;
      if (state) {
        state.recomputeBacklink = currentRecomputeBacklink;
      }

      return { isRecomputeBacklinkSameAsRecorded };
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

describe('loading with the backlinks pane closed', () => {
  afterEach(async () => {
    await runStep('openPane');
  }, SCENARIO_TIMEOUT_IN_MS);

  it('patches the pane when it is opened later', async () => {
    await runStep('setUp');
    await runStep('disableBacklinksInDocument');
    // Reloading unloads the patch, and with the pane closed nothing installs it again: the bare method is recorded.
    await runStep('closePaneAndReloadPlugin');

    const afterOpen = await runStep('openPane');

    expect(afterOpen.isRecomputeBacklinkSameAsRecorded).toBe(false);
  }, SCENARIO_TIMEOUT_IN_MS);

  it('patches through the in-document backlinks when only those are on screen', async () => {
    await runStep('setUp');
    await runStep('enableBacklinksInDocument');
    try {
      // Records the method the load left behind while only the in-document backlinks were on screen.
      await runStep('closePaneAndReloadPlugin');
      await runStep('disableBacklinksInDocument');
      // With nothing on screen at all, the reload leaves the bare method, which must differ from the one recorded.
      const afterBareReload = await runStep('closePaneAndReloadPlugin');

      expect(afterBareReload.isRecomputeBacklinkSameAsRecorded).toBe(false);
    } finally {
      await runStep('disableBacklinksInDocument');
    }
  }, SCENARIO_TIMEOUT_IN_MS);
});
