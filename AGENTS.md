# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Invariant: the plugin has one job, pointing to its successor

Since 3.0.0 `Backlink Cache` does nothing but point to `Advanced Metadata Cache` (`advanced-metadata-cache`), which carries the backlink cache this plugin used to keep. The owner's ruling: "Backlink Cache should have only role now: to ask to install AMC, and don't do anything else". So:

- While `Advanced Metadata Cache` is not enabled, `PluginSuggestionComponent` from `obsidian-dev-utils` suggests installing it, on load and in the settings tab.
- Once it is enabled, `SuccessorEnabledComponent` shows the owner's exact notice, `You have <code>Advanced Metadata Cache</code> installed which is a successor for <code>Backlink Cache</code>`, with exactly two buttons: uninstall (`app.plugins.uninstallPlugin`) and disable (`app.plugins.disablePluginAndSave`). There is deliberately no decline.
- The only setting is `isAdvancedMetadataCacheSuggestionDeclined`, which the suggestion needs. The plugin registers no command of its own and patches nothing.

Do not bring any of the old cache behavior back here: it belongs in `Advanced Metadata Cache`. The repo stays live and listed in the community directory; it is never archived or removed from the listing.

`successor-notice.desktop.integration.test.ts` pins both notices in a real Obsidian, using a stub successor written into the temporary vault. Obsidian counts a plugin as enabled only once it is in the saved `enabledPlugins` set, so the stub is enabled with `enablePluginAndSave`, not `enablePlugin`.
