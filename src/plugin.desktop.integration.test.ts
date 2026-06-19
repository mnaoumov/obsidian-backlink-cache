import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup';
import {
  describe,
  expect,
  it
} from 'vitest';

import { registerReadmeCallsSuite } from './readme-calls-shared.integration.test.ts';

describe('Smoke test', () => {
  it('should load plugin on Desktop', () => {
    const vault = getTempVault();
    expect(vault.path).toBeTruthy();
  });
});

registerReadmeCallsSuite('Desktop');
