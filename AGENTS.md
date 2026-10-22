# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Invariant: the plugin has one job, pointing to its successor

Since 3.0.0 `Backlink Cache` does nothing but point to `Advanced Metadata Cache` (`advanced-metadata-cache`), which carries the backlink cache this plugin used to keep. The owner's ruling: "`Backlink Cache` should have only role now: to ask to install AMC, and don't do anything else". So:

- While `Advanced Metadata Cache` is not enabled, `PluginSuggestionComponent` from `@mnaoumov/obsidian-lib` suggests installing it, on load and in the settings tab.
- Once it is enabled, `SuccessorEnabledComponent` shows the notice `<code>Advanced Metadata Cache</code> is enabled and replaces <code>Backlink Cache</code>, which no longer does anything. Uninstall it, or disable it if you want to keep the files.`, with exactly two buttons in one row: `Uninstall` (the call to action, `app.plugins.uninstallPlugin`) and `Disable` (`app.plugins.disablePluginAndSave`). There is deliberately no decline. The labels are bare verbs because a notice is too narrow for two labels that repeat the plugin name to share a row. The row's layout is in `src/styles/main.scss`.
- The only setting is `isAdvancedMetadataCacheSuggestionDeclined`, which the suggestion needs. The plugin registers no command of its own and patches nothing.

Do not bring any of the old cache behavior back here: it belongs in `Advanced Metadata Cache`.

`successor-notice.desktop.integration.test.ts` pins both notices in a real Obsidian, using a stub successor written into the temporary vault. Obsidian counts a plugin as enabled only once it is in the saved `enabledPlugins` set, so the stub is enabled with `enablePluginAndSave`, not `enablePlugin`.

## Invariant: the GitHub repo is never archived

The plugin is retired in favour of `Advanced Metadata Cache`, but the GitHub repo is NOT archived, and must not be archived again. Archiving it on 2026-10-17 made the community directory archive the plugin, and on 2026-10-18 the directory's mirror bot dropped it from `obsidian-releases`' `community-plugins.json` (commit `5d9123fad`). Obsidian checks for updates against that list only, so from then on installed copies stopped receiving updates. Pushes and releases work as in any other repo.

Taking the repo out of the archive does not put the plugin back on that list. The listing has to be restored by hand on the directory's plugin dashboard; the next mirror run then adds it back, and updates flow again.
