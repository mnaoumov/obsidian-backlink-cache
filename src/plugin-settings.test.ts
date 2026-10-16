import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';

describe('PluginSettings', () => {
  it('should have isAdvancedMetadataCacheSuggestionDeclined default to false', () => {
    const settings = new PluginSettings();
    expect(settings.isAdvancedMetadataCacheSuggestionDeclined).toBe(false);
  });
});
