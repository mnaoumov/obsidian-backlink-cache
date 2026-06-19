import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { BacklinkCacheComponent } from '../backlink-cache-component.ts';

export class RefreshBacklinkPanelsCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly backlinkCacheComponent: BacklinkCacheComponent) {
    super({
      icon: 'refresh',
      id: 'refresh-backlink-panels',
      name: 'Refresh backlink panels'
    });
  }

  protected override async execute(): Promise<void> {
    await this.backlinkCacheComponent.refreshBacklinkPanels();
  }
}
