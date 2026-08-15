# Settings

Open **Settings -> Community plugins -> Backlink Cache** to configure the plugin. Each option below lists the setting key stored in the plugin's `data.json`.

- `shouldAutomaticallyRefreshBacklinkPanels`
  - when on, open **Backlinks** panes refresh automatically as the cache updates, so they always reflect the latest links. When off, refresh them yourself with the **Backlink Cache: Refresh backlink panels** command.
- `shouldShowProgressBarOnLoad`
  - when on, a progress bar is shown while the cache is built as the vault loads. This is reassuring in large vaults where the initial build takes a moment; turn it off for a quieter startup.

There is also a command, **Backlink Cache: Refresh backlink panels**, that rebuilds the visible Backlinks panes on demand.

## See the difference

Automatic refreshing is **off** by default, so the manual command is the behavior most readers actually have. Put a Backlinks pane on screen first, then edit a link in one of the [Topics](<./Topics/Central topic.md>) notes and watch what the pane does:

```code-button
---
caption: Open "Central topic" and show its Backlinks pane
---
await require('/demoSetup.ts').showCentralTopicBacklinks(app);
```

```code-button
---
caption: Refresh backlink panels now
---
require('/demoSetup.ts').refreshBacklinkPanels(app);
```

Manual equivalent: **Backlink Cache: Refresh backlink panels** in the Command Palette.

Then turn automatic refreshing on and make the same edit - the pane keeps itself current and the command becomes unnecessary:

```code-button
---
caption: Refresh backlink panels automatically
---
await require('/demoSetup.ts').changeSettings(app, { shouldAutomaticallyRefreshBacklinkPanels: true });
```

```code-button
---
caption: Back to manual refreshing (the default)
---
await require('/demoSetup.ts').changeSettings(app, { shouldAutomaticallyRefreshBacklinkPanels: false });
```

Manual equivalent: toggle **Should automatically refresh backlink panels** above.

The progress bar only appears while the cache is built at vault load, so it needs a restart to see either way:

```code-button
---
caption: Hide the progress bar on load
---
await require('/demoSetup.ts').changeSettings(app, { shouldShowProgressBarOnLoad: false });
```

```code-button
---
caption: Show it again (the default)
---
await require('/demoSetup.ts').changeSettings(app, { shouldShowProgressBarOnLoad: true });
```
