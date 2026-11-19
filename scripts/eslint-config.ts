import type { Linter } from 'eslint';

import { defineEslintConfigs } from '@mnaoumov/obsidian-dev-toolkit/linters/eslint-config';

export const configs: Linter.Config[] = defineEslintConfigs({
  customConfigs(context) {
    return [
      {
        files: context.allFiles(),
        rules: {
          'typescript-dev-toolkit/no-undefined-return-type': 'error'
        }
      }
    ];
  }
});
