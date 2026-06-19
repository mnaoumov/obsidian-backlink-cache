/**
 * @file
 *
 * Shared integration suite that exercises every `app.metadataCache.getBacklinksForFile`
 * usage documented in `README.md`:
 *
 * - Fast version with a `TFile` and with a path string.
 * - Safe version with a `TFile` and with a path string.
 * - Original (built-in) version.
 *
 * The suite is registered by the platform-specific entry points
 * (`plugin.desktop.integration.test.ts`, `plugin.android.integration.test.ts`)
 * so the exact same README calls are verified on both Desktop and mobile.
 *
 * This file is intentionally named `*.integration.test.ts` (matching the unit project's
 * exclude glob) so it is excluded from unit-test collection and coverage, yet not matched
 * by any `*.desktop`/`*.android` integration project glob — it only runs when imported by
 * a platform entry point.
 */

import type { CustomArrayDict } from '@obsidian-typings/obsidian-public-latest';
import type {
  Reference,
  TFile
} from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

/**
 * A self-contained callback (no external closures) that invokes one of the documented
 * `getBacklinksForFile` overloads and returns the resulting dictionary. Serialized and
 * executed inside Obsidian, so it must not reference anything outside its parameters.
 */
type BacklinksCall = (
  getBacklinksForFile: PatchedGetBacklinksForFile,
  targetFile: TFile,
  targetPath: string
) => CustomArrayDict<Reference> | Promise<CustomArrayDict<Reference>>;

/**
 * Serializable projection of a {@link CustomArrayDict} returned by a backlink call.
 */
interface BacklinksCallResult {
  readonly count: number;
  readonly keys: string[];
}

/**
 * The augmented shape of `app.metadataCache.getBacklinksForFile` after the plugin
 * patches it. Mirrors the `types.d.ts` shipped for consumers, as documented in the README.
 */
interface PatchedGetBacklinksForFile {
  (pathOrFile: string | TFile): CustomArrayDict<Reference>;
  originalFn(file: TFile): CustomArrayDict<Reference>;
  safe(pathOrFile: string | TFile): Promise<CustomArrayDict<Reference>>;
}

const TARGET_PATH = 'readme-calls-target.md';
const SOURCE_PATH = 'readme-calls-source.md';
const TARGET_CONTENT = '# Target';
const SOURCE_CONTENT = 'Link to [[readme-calls-target]].';

const WARM_UP_MAX_ATTEMPTS = 30;
const WARM_UP_POLL_DELAY_IN_MILLISECONDS = 200;

/**
 * Registers the README-call integration tests for the given platform.
 *
 * @param platform - Human-readable platform label used in test names (e.g. `'Desktop'`).
 */
export function registerReadmeCallsSuite(platform: string): void {
  describe(`README getBacklinksForFile calls (${platform})`, () => {
    beforeAll(async () => {
      const result = await evalInObsidian({
        args: {
          maxAttempts: WARM_UP_MAX_ATTEMPTS,
          pollDelayInMilliseconds: WARM_UP_POLL_DELAY_IN_MILLISECONDS,
          sourceContent: SOURCE_CONTENT,
          sourcePath: SOURCE_PATH,
          targetContent: TARGET_CONTENT,
          targetPath: TARGET_PATH
        },
        async fn({ app, maxAttempts, pollDelayInMilliseconds, sourceContent, sourcePath, targetContent, targetPath }) {
          for (const path of [targetPath, sourcePath]) {
            const existing = app.vault.getAbstractFileByPath(path);
            if (existing) {
              // eslint-disable-next-line obsidianmd/prefer-file-manager-trash-file -- Permanent cleanup of stale test fixtures.
              await app.vault.delete(existing, true);
            }
          }

          await app.vault.create(targetPath, targetContent);
          await app.vault.create(sourcePath, sourceContent);

          const getBacklinksForFile = app.metadataCache.getBacklinksForFile as PatchedGetBacklinksForFile;

          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const dict = await getBacklinksForFile.safe(targetPath);
            if (dict.keys().includes(sourcePath)) {
              return { found: true };
            }
            await sleep(pollDelayInMilliseconds);
          }

          return { found: false };

          function sleep(milliseconds: number): Promise<void> {
            return new Promise((resolve) => {
              window.setTimeout(resolve, milliseconds);
            });
          }
        },
        vaultPath: getTempVault().path
      });

      expect(result.found).toBe(true);
    });

    it('fast version resolves backlinks from a TFile', async () => {
      const result = await callBacklinks((getBacklinksForFile, targetFile) => getBacklinksForFile(targetFile));
      expect(result.keys).toContain(SOURCE_PATH);
      expect(result.count).toBeGreaterThanOrEqual(1);
    });

    it('fast version resolves backlinks from a path string', async () => {
      const result = await callBacklinks((getBacklinksForFile, _targetFile, targetPath) => getBacklinksForFile(targetPath));
      expect(result.keys).toContain(SOURCE_PATH);
      expect(result.count).toBeGreaterThanOrEqual(1);
    });

    it('safe version resolves backlinks from a TFile', async () => {
      const result = await callBacklinks(async (getBacklinksForFile, targetFile) => getBacklinksForFile.safe(targetFile));
      expect(result.keys).toContain(SOURCE_PATH);
      expect(result.count).toBeGreaterThanOrEqual(1);
    });

    it('safe version resolves backlinks from a path string', async () => {
      const result = await callBacklinks(async (getBacklinksForFile, _targetFile, targetPath) => getBacklinksForFile.safe(targetPath));
      expect(result.keys).toContain(SOURCE_PATH);
      expect(result.count).toBeGreaterThanOrEqual(1);
    });

    it('original version resolves backlinks via the built-in implementation', async () => {
      const result = await callBacklinks((getBacklinksForFile, targetFile) => getBacklinksForFile.originalFn(targetFile));
      expect(result.keys).toContain(SOURCE_PATH);
      expect(result.count).toBeGreaterThanOrEqual(1);
    });
  });
}

/**
 * Runs a single README backlink call inside Obsidian against the warmed-up fixtures
 * and returns its serializable projection.
 *
 * @param call - The backlink call to invoke. See {@link BacklinksCall}.
 * @returns The {@link BacklinksCallResult} for the call.
 */
async function callBacklinks(call: BacklinksCall): Promise<BacklinksCallResult> {
  return evalInObsidian({
    args: {
      call,
      targetPath: TARGET_PATH
    },
    async fn({ app, call: invoke, obsidianModule, targetPath }) {
      const targetFile = app.vault.getAbstractFileByPath(targetPath);
      if (!(targetFile instanceof obsidianModule.TFile)) {
        throw new Error(`Target file not found: ${targetPath}`);
      }

      const getBacklinksForFile = app.metadataCache.getBacklinksForFile as PatchedGetBacklinksForFile;
      const dict = await invoke(getBacklinksForFile, targetFile, targetPath);
      return {
        count: dict.count(),
        keys: dict.keys()
      };
    },
    vaultPath: getTempVault().path
  });
}
