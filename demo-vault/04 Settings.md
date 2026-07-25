[Docs](https://github.com/mnaoumov/obsidian-backlink-cache/)

# Settings

Open **Settings -> Community plugins -> Backlink Cache** to configure the plugin. Each option below lists the setting key stored in the plugin's `data.json`.

- `shouldAutomaticallyRefreshBacklinkPanels` - when on, open **Backlinks** panes refresh automatically as the cache updates, so they always reflect the latest links. When off, refresh them yourself with the **Backlink Cache: Refresh backlink panels** command.
- `shouldShowProgressBarOnLoad` - when on, a progress bar is shown while the cache is built as the vault loads. This is reassuring in large vaults where the initial build takes a moment; turn it off for a quieter startup.

There is also a command, **Backlink Cache: Refresh backlink panels**, that rebuilds the visible Backlinks panes on demand.
