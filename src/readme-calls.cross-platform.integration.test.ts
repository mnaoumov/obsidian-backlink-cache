/**
 * @file
 *
 * Integration suite that exercises every `app.metadataCache.getBacklinksForFile`
 * usage documented in `README.md`:
 *
 * - Fast version with a `TFile` and with a path string.
 * - Safe version with a `TFile` and with a path string.
 * - Original (built-in) version.
 *
 * Named `*.cross-platform.integration.test.ts` (per G47), so the desktop AND android projects both
 * collect it and the same flow is verified on each.
 */

import type { CustomArrayDict } from '@obsidian-typings/obsidian-public-latest';
import type {
  Reference,
  TFile
} from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
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
  // eslint-disable-next-line unicorn/name-replacements -- `originalFn` is this plugin's documented public API - the README tells users to call it.
  originalFn(file: TFile): CustomArrayDict<Reference>;
  safe(pathOrFile: string | TFile): Promise<CustomArrayDict<Reference>>;
}

const TARGET_PATH = 'readme-calls-target.md';
const SOURCE_PATH = 'readme-calls-source.md';
const TARGET_CONTENT = '# Target';
const SOURCE_CONTENT = 'Link to [[readme-calls-target]].';

const WARM_UP_MAX_ATTEMPTS = 30;
const WARM_UP_POLL_DELAY_IN_MILLISECONDS = 200;
describe('README getBacklinksForFile calls', () => {
  beforeAll(async () => {
    const result = await evalInObsidian({
      // eslint-disable-next-line unicorn/name-replacements -- `args` is an `obsidian-integration-testing` parameter name.
      args: {
        maxAttempts: WARM_UP_MAX_ATTEMPTS,
        pollDelayInMilliseconds: WARM_UP_POLL_DELAY_IN_MILLISECONDS,
        sourceContent: SOURCE_CONTENT,
        sourcePath: SOURCE_PATH,
        targetContent: TARGET_CONTENT,
        targetPath: TARGET_PATH
      },
      // eslint-disable-next-line unicorn/name-replacements -- `fn` is an `obsidian-integration-testing` parameter name.
      async fn({ app, maxAttempts, pollDelayInMilliseconds, sourceContent, sourcePath, targetContent, targetPath }) {
        for (const path of [targetPath, sourcePath]) {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
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

/**
 * Runs a single README backlink call inside Obsidian against the warmed-up fixtures
 * and returns its serializable projection.
 *
 * @param call - The backlink call to invoke. See {@link BacklinksCall}.
 * @returns The {@link BacklinksCallResult} for the call.
 */
async function callBacklinks(call: BacklinksCall): Promise<BacklinksCallResult> {
  return evalInObsidian({
    // eslint-disable-next-line unicorn/name-replacements -- `args` is an `obsidian-integration-testing` parameter name.
    args: {
      call,
      targetPath: TARGET_PATH
    },
    // eslint-disable-next-line unicorn/name-replacements -- `fn` is an `obsidian-integration-testing` parameter name.
    async fn({ app, call: invoke, obsidianModule, targetPath }) {
      const targetFile = app.vault.getAbstractFileByPath(targetPath);
      if (!(targetFile instanceof obsidianModule.TFile)) {
        throw new TypeError(`Target file not found: ${targetPath}`);
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
