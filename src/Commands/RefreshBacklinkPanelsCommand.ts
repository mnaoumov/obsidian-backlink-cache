import { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/Commands/CommandBase';
import { NonEditorCommandBase } from 'obsidian-dev-utils/obsidian/Commands/NonEditorCommandBase';

import type { Plugin } from '../Plugin.ts';

class RefreshBacklinkPanelsCommandInvocation extends CommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin) {
    super(plugin);
  }

  protected override async execute(): Promise<void> {
    await this.plugin.refreshBacklinkPanels();
  }
}

export class RefreshBacklinkPanelsCommand extends NonEditorCommandBase<Plugin> {
  public constructor(plugin: Plugin) {
    super({
      icon: 'refresh',
      id: 'refresh-backlink-panels',
      name: 'Refresh backlink panels',
      plugin
    });
  }

  protected override createCommandInvocation(): CommandInvocationBase {
    return new RefreshBacklinkPanelsCommandInvocation(this.plugin);
  }
}
