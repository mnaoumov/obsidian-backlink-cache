import {
  describe,
  expect,
  it
} from 'vitest';

import { Plugin } from './plugin.ts';

describe('main', () => {
  it('should re-export Plugin as default', async () => {
    const mainModule = await import('./main.ts');
    expect(mainModule.default).toBe(Plugin);
  });
});
