import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';

describe('PluginSettings', () => {
  it('should have shouldAutomaticallyRefreshBacklinkPanels default to false', () => {
    const settings = new PluginSettings();
    expect(settings.shouldAutomaticallyRefreshBacklinkPanels).toBe(false);
  });

  it('should have shouldShowProgressBarOnLoad default to true', () => {
    const settings = new PluginSettings();
    expect(settings.shouldShowProgressBarOnLoad).toBe(true);
  });
});
