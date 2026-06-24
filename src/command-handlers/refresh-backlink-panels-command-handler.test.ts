import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { BacklinkCacheComponent } from '../backlink-cache-component.ts';

import { RefreshBacklinkPanelsCommandHandler } from './refresh-backlink-panels-command-handler.ts';

describe('RefreshBacklinkPanelsCommandHandler', () => {
  it('should create handler with correct id, name, and icon', () => {
    const backlinkCacheComponent = strictProxy<BacklinkCacheComponent>({
      refreshBacklinkPanels: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    });
    const handler = new RefreshBacklinkPanelsCommandHandler(backlinkCacheComponent);

    const command = handler.buildCommand();
    expect(command.id).toBe('refresh-backlink-panels');
    expect(command.name).toBe('Refresh backlink panels');
    expect(command.icon).toBe('refresh');
  });

  it('should call refreshBacklinkPanels when command callback is invoked', async () => {
    const refreshBacklinkPanels = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const backlinkCacheComponent = strictProxy<BacklinkCacheComponent>({
      refreshBacklinkPanels
    });
    const handler = new RefreshBacklinkPanelsCommandHandler(backlinkCacheComponent);

    const command = handler.buildCommand();
    expect(command.checkCallback).toBeDefined();

    const isAvailable = command.checkCallback?.(true);
    expect(isAvailable).toBe(true);

    command.checkCallback?.(false);

    await vi.waitFor(() => {
      expect(refreshBacklinkPanels).toHaveBeenCalledOnce();
    });
  });
});
