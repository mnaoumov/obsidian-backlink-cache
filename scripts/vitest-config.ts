import type { ObsidianPluginVitestConfigContext } from 'obsidian-dev-utils/script-utils/test-runners/vitest-config';
import type { TestProjectConfiguration } from 'vitest/config';

import { defineObsidianPluginVitestConfig } from 'obsidian-dev-utils/script-utils/test-runners/vitest-config';

/**
 * The demo-vault button suite. It drives a real desktop Obsidian like the desktop project, but opens
 * a copy of the in-repo `demo-vault/` rather than an empty vault — hence its own `globalSetup` — and
 * needs its own suffix so the desktop project does not also collect it and open it against a vault
 * with no notes in it.
 */
const DEMO_VAULT_TEST_FILES = 'src/**/*.demo-vault.integration.test.ts';

/**
 * One `it` per note runs every button in that note, and each button re-opens the note, walks the
 * preview to find itself and then waits up to 15s for a result. A note with a dozen buttons therefore
 * blows well past the desktop project's 30s default — which fails the whole note with a bare vitest
 * timeout instead of naming the button that actually misbehaved.
 */
const DEMO_VAULT_TIMEOUT_IN_MILLISECONDS = 600_000;

export const config = defineObsidianPluginVitestConfig({
  customProjects(context: ObsidianPluginVitestConfigContext): TestProjectConfiguration[] {
    return [
      {
        test: {
          ...context.desktop,
          globalSetup: ['./scripts/demo-vault-global-setup.ts'],
          include: [DEMO_VAULT_TEST_FILES],
          name: 'integration-tests:demo-vault',
          testTimeout: DEMO_VAULT_TIMEOUT_IN_MILLISECONDS
        }
      }
    ];
  }
});
