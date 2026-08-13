# Backlink Cache

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/mnaoumov)
[![GitHub release](https://img.shields.io/github/v/release/mnaoumov/obsidian-backlink-cache)](https://github.com/mnaoumov/obsidian-backlink-cache/releases)
[![GitHub downloads](https://img.shields.io/github/downloads/mnaoumov/obsidian-backlink-cache/total)](https://github.com/mnaoumov/obsidian-backlink-cache/releases)
[![Coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/mnaoumov/obsidian-backlink-cache)

Asking [Obsidian](https://obsidian.md/) which notes link to this one means scanning every note in the
vault. On a large vault that is slow enough to be felt — the Backlinks pane lags, and every plugin that
needs backlinks pays the same cost, repeatedly.

This plugin keeps a backlink index and answers from it instead. The Backlinks pane gets faster, and so
does anything else that asks. On a small vault you will not notice; that is the point at which you do
not need it.

## Demo vault

**The documentation is an interactive demo vault.** Every feature has a note that explains what it does
and why you would want it, with buttons that measure the difference for real.

**[Start reading here](<./demo-vault/00 Start.md>)** — it is plain markdown, so it works on GitHub with
nothing installed.

A copy of the vault ships with every release. You can access it via any of the following:

1. Running the **Backlink Cache: Open demo vault** command.
2. Downloading `backlink-cache-demo-vault-<version>.zip` (`<version>` is the release version) from the [Releases](https://github.com/mnaoumov/obsidian-backlink-cache/releases).
3. Browsing its source in [`demo-vault/`](./demo-vault/README.md) in this repository.

## What it does

- **A backlink index that keeps itself current**, so the Backlinks pane and every plugin that asks for
  backlinks stop rescanning the vault.
  [01 Backlink cache](<./demo-vault/01 Backlink cache.md>)
- **Three ways to ask** — fast from the cache, safe after pending changes settle, or the original
  built-in implementation for comparison.
  [02 Fast, safe, and original backlinks](<./demo-vault/02 Fast, safe, and original backlinks.md>)
- **Canvas files are indexed too**, and their links are exposed through `getCache()`, which Obsidian
  leaves empty for canvases.
  [03 Canvas backlinks](<./demo-vault/03 Canvas backlinks.md>)
- **Frontmatter markdown links count as backlinks** when the
  [`Frontmatter Markdown Links`](https://obsidian.md/plugins?id=frontmatter-markdown-links) plugin is
  installed.
  [03 Canvas backlinks](<./demo-vault/03 Canvas backlinks.md>)
- **Refresh behavior is configurable.**
  [04 Settings](<./demo-vault/04 Settings.md>)

## For plugin developers

This plugin replaces `app.metadataCache.getBacklinksForFile()` with a faster implementation, adds an
overload accepting a vault `path` as well as a `TFile`, and keeps the original reachable:

```js
const fast = app.metadataCache.getBacklinksForFile(pathOrFile);
const safe = await app.metadataCache.getBacklinksForFile.safe(pathOrFile);
const original = app.metadataCache.getBacklinksForFile.originalFn(file);
```

To use the updated signatures from your own plugin, copy [types.d.ts](./types.d.ts) into your code.
[02 Fast, safe, and original backlinks](<./demo-vault/02 Fast, safe, and original backlinks.md>) runs
all three side by side.

## Installation

The plugin is available in [the official Community Plugins repository](https://obsidian.md/plugins?id=backlink-cache).

### Beta versions

To install the latest beta release of this plugin (regardless if it is available in [the official Community Plugins repository](https://obsidian.md/plugins) or not), follow these steps:

1. Ensure you have the [BRAT plugin](https://obsidian.md/plugins?id=obsidian42-brat) installed and enabled.
2. Click [Install via BRAT](https://intradeus.github.io/http-protocol-redirector?r=obsidian://brat?plugin=https://github.com/mnaoumov/obsidian-backlink-cache).
3. An Obsidian pop-up window should appear. In the window, click the `Add plugin` button once and wait a few seconds for the plugin to install.

## Debugging

By default, debug messages for this plugin are hidden.

To show them, run the following command:

```js
window.DEBUG.enable('backlink-cache');
```

For more details, refer to the [documentation](https://mnaoumov.dev/obsidian-dev-utils/guides/debugging/).

## Changelog

All notable changes to this project will be documented in the [CHANGELOG](./CHANGELOG.md).

## Contributing

Contributions are welcome — see [CONTRIBUTING](./CONTRIBUTING.md) to get set up.

## Support

<!-- markdownlint-disable MD033 -->

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" width="217"></a>

<!-- markdownlint-enable MD033 -->

## My other Obsidian resources

[See my other Obsidian resources](https://github.com/mnaoumov/obsidian-resources).

## License

© [Michael Naumov](https://github.com/mnaoumov/)
