# Successor suggestion

`Backlink Cache` shows one of two notices when it loads, depending on [Advanced Metadata Cache](https://community.obsidian.md/plugins/advanced-metadata-cache), the plugin that replaced it.

**While `Advanced Metadata Cache` is not enabled**, the notice says that `Backlink Cache` no longer does anything and offers to install it. Its button reads **Install and enable**, or **Enable** when `Advanced Metadata Cache` is installed but switched off. **Not now** silences the notice until you clear that answer.

**Once `Advanced Metadata Cache` is enabled**, `Backlink Cache` has nothing left to offer, so the notice asks you to remove it:

> You have `Advanced Metadata Cache` installed which is a successor for `Backlink Cache`
>
> **Uninstall `Backlink Cache`** | **Disable `Backlink Cache`**

There is no "not now" on that one: staying installed beside its successor does nothing for you.

The same banner is the only content of **Settings -> Community plugins -> `Backlink Cache`**. The settings tab ignores a "not now", because opening it is a fresher signal than an answer you gave earlier.

## The one stored key

The plugin keeps one key in its `data.json`, and it is bookkeeping rather than a toggle you set:

- `isAdvancedMetadataCacheSuggestionDeclined`
  - whether you have answered **Not now** to the suggestion. It silences the notice, not the settings-tab banner.

## See it again

If you have already answered **Not now**, clear that answer and reload the plugin to get the notice back:

```code-button
---
caption: Show the successor suggestion again
---
await require('/demoSetup.ts').showSuggestionAgain(app);
```

Manual equivalent: delete the plugin's `data.json`, then disable and enable **`Backlink Cache`** in **Settings -> Community plugins**.
