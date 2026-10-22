# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Invariant: the plugin has one job, pointing to its successor

Since 3.0.0 `Backlink Cache` does nothing but point to `Advanced Metadata Cache` (`advanced-metadata-cache`), which carries the backlink cache this plugin used to keep. The owner's ruling: "`Backlink Cache` should have only role now: to ask to install AMC, and don't do anything else". So:

- While `Advanced Metadata Cache` is not enabled, `PluginSuggestionComponent` from `@mnaoumov/obsidian-lib` suggests installing it, on load and in the settings tab.
- Once it is enabled, `SuccessorEnabledComponent` shows the notice `<code>Advanced Metadata Cache</code> is enabled and replaces <code>Backlink Cache</code>, which no longer does anything. Uninstall it, or disable it if you want to keep the files.`, with exactly two buttons in one row: `Uninstall` (the call to action, `app.plugins.uninstallPlugin`) and `Disable` (`app.plugins.disablePluginAndSave`). There is deliberately no decline. The labels are bare verbs because a notice is too narrow for two labels that repeat the plugin name to share a row. The row's layout is in `src/styles/main.scss`.
- The only setting is `isAdvancedMetadataCacheSuggestionDeclined`, which the suggestion needs. The plugin registers no command of its own and patches nothing.

Do not bring any of the old cache behavior back here: it belongs in `Advanced Metadata Cache`.

`successor-notice.desktop.integration.test.ts` pins both notices in a real Obsidian, using a stub successor written into the temporary vault. Obsidian counts a plugin as enabled only once it is in the saved `enabledPlugins` set, so the stub is enabled with `enablePluginAndSave`, not `enablePlugin`.

## Invariant: the GitHub repo is archived and the plugin is hidden from the directory

The GitHub repo is archived on purpose, so it is read-only: a push fails with `This repository was archived so it is read-only`. Archiving does not stop updates reaching users who already have the plugin installed. Any push, release included, needs the owner's approval of a short window: `gh repo unarchive mnaoumov/obsidian-backlink-cache --yes` right before the push, then `gh repo archive mnaoumov/obsidian-backlink-cache --yes` as soon as the push (and any release workflow it starts) has finished, so the repo spends minutes out of the archive, not hours.

The plugin stays hidden from browsing in the community directory. Lifting the archive lets the listing be restored from the directory dashboard, but that is a separate manual act, and it is not done.
