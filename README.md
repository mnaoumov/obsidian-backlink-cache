# Backlink Cache

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/mnaoumov) [![GitHub release](https://img.shields.io/github/v/release/mnaoumov/obsidian-backlink-cache)](https://github.com/mnaoumov/obsidian-backlink-cache/releases) [![GitHub downloads](https://img.shields.io/github/downloads/mnaoumov/obsidian-backlink-cache/total)](https://github.com/mnaoumov/obsidian-backlink-cache/releases) [![Coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/mnaoumov/obsidian-backlink-cache)

> [!WARNING]
> **`Backlink Cache` no longer does anything but point to its successor.** Install [Advanced Metadata Cache](https://community.obsidian.md/plugins/advanced-metadata-cache) instead: it carries the backlink cache this plugin used to keep, and more. Once it is enabled, uninstall `Backlink Cache`.

This plugin used to keep a backlink index for [Obsidian](https://obsidian.md/), so that `app.metadataCache.getBacklinksForFile()` answered without rescanning the vault. That cache now lives in [Advanced Metadata Cache](https://community.obsidian.md/plugins/advanced-metadata-cache), and since version 3.0.0 every part of it is gone from here.

## Demo vault

**The documentation is an interactive demo vault.** Its one feature note explains both notices and lets you bring the suggestion back.

**[Start reading here](<./demo-vault/00 Start.md>)** — it is plain markdown, so it works on GitHub with nothing installed.

A copy of the vault ships with every release. You can access it via any of the following:

1. Downloading `backlink-cache-demo-vault.zip` from the [Releases](https://github.com/mnaoumov/obsidian-backlink-cache/releases). It unzips into a single `backlink-cache-demo-vault-<version>` folder.
2. Browsing its source in [`demo-vault/`](./demo-vault/README.md) in this repository.

## What it does

- **It suggests installing `Advanced Metadata Cache`** while that plugin is not enabled, with a notice on load and a banner in its settings. [01 Successor suggestion](<./demo-vault/01 Successor suggestion.md>)
- **It asks to be removed** once `Advanced Metadata Cache` is enabled, with exactly two buttons: uninstall `Backlink Cache`, or disable it. [01 Successor suggestion](<./demo-vault/01 Successor suggestion.md>)

Nothing else. It no longer patches `getBacklinksForFile()`, indexes canvases, or registers any command.

## Installation

Do not install this plugin: install [Advanced Metadata Cache](https://community.obsidian.md/plugins/advanced-metadata-cache) from the official Community Plugins repository instead.

## Debugging

By default, debug messages for this plugin are hidden.

To show them, run the following command in the `DevTools Console`:

```js
window.DEBUG.enable('backlink-cache');
```

For more details, refer to the [documentation](https://mnaoumov.dev/obsidian-lib/guides/debugging/).

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
