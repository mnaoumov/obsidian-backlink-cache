import {
  describe,
  expect,
  it
} from 'vitest';

// eslint-disable-next-line import-x/no-rename-default -- Testing default export.
import mainDefault from './main.ts';
import { Plugin } from './plugin.ts';

describe('main', () => {
  it('should re-export Plugin as default', () => {
    expect(mainDefault).toBe(Plugin);
  });
});
