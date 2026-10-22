# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Invariant: the plugin has one job, pointing to its successor

Since 3.0.0 `Backlink Cache` does nothing but point to `Advanced Metadata Cache` (`advanced-metadata-cache`), which carries the backlink cache this plugin used to keep. The owner's ruling: "`Backlink Cache` should have only role now: to ask to install AMC, and don't do anything else". So:

- While `Advanced Metadata Cache` is not enabled, `PluginSuggestionComponent` from `@mnaoumov/obsidian-lib` suggests installing it, on load and in the settings tab.
- Once it is enabled, `SuccessorEnabledComponent` shows the notice `<code>Advanced Metadata Cache</code> is enabled and replaces <code>Backlink Cache</code>, which no longer does anything. Uninstall it, or disable it if you want to keep the files.`, with exactly two buttons in one row: `Uninstall` (the call to action, `app.plugins.uninstallPlugin`) and `Disable` (`app.plugins.disablePluginAndSave`). There is deliberately no decline. The labels are bare verbs because a notice is too narrow for two labels that repeat the plugin name to share a row. The row's layout is in `src/styles/main.scss`.
- The only setting is `isAdvancedMetadataCacheSuggestionDeclined`, which the suggestion needs. The plugin registers no command of its own and patches nothing.

Do not bring any of the old cache behavior back here: it belongs in `Advanced Metadata Cache`. The repo stays live and listed in the community directory; it is never archived or removed from the listing.

`successor-notice.desktop.integration.test.ts` pins both notices in a real Obsidian, using a stub successor written into the temporary vault. Obsidian counts a plugin as enabled only once it is in the saved `enabledPlugins` set, so the stub is enabled with `enablePluginAndSave`, not `enablePlugin`.
