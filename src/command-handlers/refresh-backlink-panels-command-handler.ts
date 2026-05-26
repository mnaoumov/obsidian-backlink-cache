import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

/**
 * Parameters for creating a {@link RefreshBacklinkPanelsCommandHandler}.
 */
export interface RefreshBacklinkPanelsCommandHandlerConstructorParams {
  /**
   * Callback to refresh the backlink panels.
   */
  refreshBacklinkPanels(this: void): Promise<void>;
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
  public constructor(params: RefreshBacklinkPanelsCommandHandlerConstructorParams) {
    super({
      icon: 'refresh',
      id: 'refresh-backlink-panels',
      name: 'Refresh backlink panels'
    });
    this.refreshBacklinkPanels = params.refreshBacklinkPanels;
  }

  /**
   * Executes the command by refreshing the backlink panels.
   */
  protected override async execute(): Promise<void> {
    await this.refreshBacklinkPanels();
  }
}
