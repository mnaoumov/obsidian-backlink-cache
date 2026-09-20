import type { Linter } from 'eslint';

import { defineConfig } from 'eslint/config';
import { defineEslintConfigs } from 'obsidian-dev-utils/script-utils/linters/eslint-config';

/**
 * The per-command timeout `scripts/vitest-config.ts` gives the
 * `integration-tests:desktop-performance` project, via
 * `context.performanceTimeoutInMilliseconds`. It has to be repeated here as a literal because an
 * ESLint rule option is data, not a value the vitest config can hand over.
 */
const DESKTOP_PERFORMANCE_CAP_IN_MILLISECONDS = 600_000;

export const configs: Linter.Config[] = defineEslintConfigs({
  customConfigs() {
    return defineConfig([
      {
        files: ['src/**/*.desktop-performance.integration.test.ts'],
        rules: {
          /*
           * 30 000 ms is the transport's DEFAULT per-command timeout, not a ceiling, and this project
           * is the one place here that raises it: `editContext` in `scripts/vitest-config.ts` sets
           * `commandTimeoutInMilliseconds` to the 600 000 ms performance budget. Scored against the
           * default, all four suites are reported for index waits of 180 000 - 240 000 ms that are
           * legal under the cap actually in force, and every one of them passes today -
           * 4 passed (4) in 201.21 s, measured 2026-09-20 over a 92 052-entry index.
           *
           * So the option carries this project's real cap rather than the rule being turned off: a
           * perf closure that one day asks for more than 600 000 ms is still reported.
           */
          'obsidian-dev-utils/no-over-cap-wait-in-eval-in-obsidian': [
            'error',
            {
              capInMilliseconds: DESKTOP_PERFORMANCE_CAP_IN_MILLISECONDS
            }
          ]
        }
      }
    ]);
  }
});
