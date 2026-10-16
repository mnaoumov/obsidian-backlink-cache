import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterAll,
  describe,
  expect,
  it
} from 'vitest';

/*
 * Pins the plugin's one job in a real Obsidian: on load it points to Advanced Metadata Cache, and once that
 * successor is enabled it asks to be removed, with exactly an uninstall and a disable button.
 *
 * The successor is a stub plugin written into the temporary vault under the real id, so the test never reaches
 * the community registry. The disable button is clicked for real; the uninstall button is not, because removing
 * the plugin under test from the shared vault would take every later suite with it.
 */

const SCENARIO_TIMEOUT_IN_MS = 120_000;

interface NoticeContent {
  readonly buttonTexts: string[];
  readonly text: string;
}

interface NoticeResult extends NoticeContent {
  readonly isPluginEnabledAfterClick: boolean;
}

type Step = 'removeSuccessor' | 'showSuccessorEnabledNotice' | 'showSuggestionNotice';

async function runStep(step: Step): Promise<NoticeResult> {
  return await evalInObsidian({
    async callback({ app, lib: { clickElement, waitUntil }, STEP: currentStep }): Promise<NoticeResult> {
      const PLUGIN_ID = 'backlink-cache';
      const SUCCESSOR_PLUGIN_ID = 'advanced-metadata-cache';
      const WAIT_TIMEOUT_IN_MS = 5000;
      const successorFolder = `${app.vault.configDir}/plugins/${SUCCESSOR_PLUGIN_ID}`;

      function findNotice(fragment: string): HTMLElement | undefined {
        return [...document.querySelectorAll<HTMLElement>('.notice')].find((noticeEl) => noticeEl.textContent.includes(fragment));
      }

      function readNotice(noticeEl: HTMLElement): NoticeContent {
        return {
          buttonTexts: [...noticeEl.querySelectorAll('button')].map((buttonEl) => buttonEl.textContent),
          text: noticeEl.textContent
        };
      }

      async function reloadPlugin(): Promise<void> {
        for (const noticeEl of document.querySelectorAll('.notice')) {
          noticeEl.remove();
        }
        await app.plugins.disablePlugin(PLUGIN_ID);
        await app.plugins.enablePlugin(PLUGIN_ID);
      }

      async function waitForNotice(fragment: string): Promise<HTMLElement> {
        let noticeEl: HTMLElement | undefined;
        await waitUntil({
          message: `a notice containing "${fragment}"`,
          predicate: () => {
            noticeEl = findNotice(fragment);
            return noticeEl !== undefined;
          },
          timeoutInMilliseconds: WAIT_TIMEOUT_IN_MS
        });
        if (!noticeEl) {
          throw new Error(`No notice containing "${fragment}".`);
        }
        return noticeEl;
      }

      switch (currentStep) {
        case 'removeSuccessor': {
          await app.plugins.disablePluginAndSave(SUCCESSOR_PLUGIN_ID);
          if (await app.vault.adapter.exists(successorFolder)) {
            await app.vault.adapter.rmdir(successorFolder, true);
          }
          await app.plugins.loadManifests();
          if (!app.plugins.enabledPlugins.has(PLUGIN_ID)) {
            await app.plugins.enablePluginAndSave(PLUGIN_ID);
          }
          return { buttonTexts: [], isPluginEnabledAfterClick: true, text: '' };
        }
        case 'showSuccessorEnabledNotice': {
          await app.vault.adapter.mkdir(successorFolder);
          await app.vault.adapter.write(
            `${successorFolder}/manifest.json`,
            JSON.stringify({
              author: 'test',
              description: 'Stub of the successor plugin.',
              id: SUCCESSOR_PLUGIN_ID,
              minAppVersion: '0.15.0',
              name: 'Advanced Metadata Cache',
              version: '0.0.1'
            })
          );
          await app.vault.adapter.write(`${successorFolder}/main.js`, 'module.exports = class extends require(\'obsidian\').Plugin {};');
          await app.plugins.loadManifests();
          // `AndSave`, because the successor counts as enabled only once it is in the saved `enabledPlugins` set.
          await app.plugins.enablePluginAndSave(SUCCESSOR_PLUGIN_ID);
          await reloadPlugin();

          const noticeEl = await waitForNotice('is a successor for');
          const result = readNotice(noticeEl);
          const disableButtonEl = [...noticeEl.querySelectorAll('button')].find((buttonEl) => buttonEl.textContent.startsWith('Disable'));
          if (!disableButtonEl) {
            throw new Error('The notice has no Disable button.');
          }
          // A notice slides in, so a click aimed at the button's centre before it settles lands beside it.
          await waitUntil({
            message: 'the Disable button to be hit-testable at its centre',
            predicate: () => {
              const rect = disableButtonEl.getBoundingClientRect();
              const hitEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
              return hitEl !== null && disableButtonEl.contains(hitEl) && noticeEl.getAnimations({ subtree: true }).length === 0;
            },
            timeoutInMilliseconds: WAIT_TIMEOUT_IN_MS
          });
          await clickElement({ element: disableButtonEl });
          await waitUntil({
            message: 'the plugin to be disabled by its Disable button',
            predicate: () => !app.plugins.enabledPlugins.has(PLUGIN_ID),
            timeoutInMilliseconds: WAIT_TIMEOUT_IN_MS
          });
          return { ...result, isPluginEnabledAfterClick: app.plugins.enabledPlugins.has(PLUGIN_ID) };
        }
        case 'showSuggestionNotice': {
          await reloadPlugin();
          const noticeEl = await waitForNotice('Advanced Metadata Cache replaced it');
          return { ...readNotice(noticeEl), isPluginEnabledAfterClick: true };
        }
        default: {
          throw new Error(`Unknown step: ${String(currentStep)}`);
        }
      }
    },
    input: {
      STEP: step
    },
    vaultPath: getTemporaryVault().path
  });
}

describe('successor notice', () => {
  afterAll(async () => {
    await runStep('removeSuccessor');
  }, SCENARIO_TIMEOUT_IN_MS);

  it('suggests installing Advanced Metadata Cache while it is not installed', async () => {
    const result = await runStep('showSuggestionNotice');

    expect(result.text).toContain('Advanced Metadata Cache replaced it');
  }, SCENARIO_TIMEOUT_IN_MS);

  it('asks to be removed, with only uninstall and disable, once Advanced Metadata Cache is enabled', async () => {
    const result = await runStep('showSuccessorEnabledNotice');

    expect(result.text).toContain('You have Advanced Metadata Cache installed which is a successor for Backlink Cache');
    expect(result.buttonTexts).toEqual(['Uninstall Backlink Cache', 'Disable Backlink Cache']);
    expect(result.isPluginEnabledAfterClick).toBe(false);
  }, SCENARIO_TIMEOUT_IN_MS);
});
