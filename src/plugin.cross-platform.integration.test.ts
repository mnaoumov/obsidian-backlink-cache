/**
 * @file
 *
 * The plugin's own load check, on both platforms.
 *
 * Per G47 this is one `*.cross-platform.integration.test.ts` file rather than a
 * `plugin.desktop` / `plugin.android` pair: the file name alone picks the projects, and the two entry
 * points previously differed only in the platform word in the test title — which the vitest project name
 * (`integration-tests:desktop` / `integration-tests:android`) already reports.
 *
 * The behavioral suite those entry points used to register is now its own `*.cross-platform.` file and
 * is collected directly.
 */

import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

describe('Smoke test', () => {
  it('should load the plugin', () => {
    const vault = getTemporaryVault();
    expect(vault.path).toBeTruthy();
  });
});
