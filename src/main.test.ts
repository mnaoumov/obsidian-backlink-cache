import {
  describe,
  expect,
  it
} from 'vitest';

import mainDefault from './main.ts';
import { Plugin } from './plugin.ts';

describe('main', () => {
  it('should re-export Plugin as default', () => {
    expect(mainDefault).toBe(Plugin);
  });
});
