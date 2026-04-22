import type { CommandHandlerParams } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler';

import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

/**
 * Parameters for creating a {@link RefreshBacklinkPanelsCommandHandler}.
 */
export interface RefreshBacklinkPanelsCommandHandlerParams extends Pick<CommandHandlerParams, 'pluginName'> {
  /**
   * Callback to refresh the backlink panels.
   */
  readonly refreshBacklinkPanels: () => Promise<void>;
}

/**
 * Handles the "Refresh backlink panels" command.
 */
export class RefreshBacklinkPanelsCommandHandler extends GlobalCommandHandler {
  private readonly refreshBacklinkPanels: () => Promise<void>;

  /**
   * Creates a new RefreshBacklinkPanelsCommandHandler.
   *
   * @param params - The parameters for the handler.
   */
  public constructor(params: RefreshBacklinkPanelsCommandHandlerParams) {
    super({ icon: 'refresh', id: 'refresh-backlink-panels', name: 'Refresh backlink panels', pluginName: params.pluginName });
    this.refreshBacklinkPanels = params.refreshBacklinkPanels;
  }

  /**
   * Executes the command by refreshing the backlink panels.
   */
  protected override async execute(): Promise<void> {
    await this.refreshBacklinkPanels();
  }
}
