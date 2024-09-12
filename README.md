# Backlink Cache

This is a plugin for [Obsidian](https://obsidian.md/) that maintains backlink cache to speed up undocumented `app.metadataCache.getBacklinksForFile` function.

It's mostly useful for users with the large vaults. On smaller vaults the difference might be unnoticeable.

It speeds up `Backlinks Pane` performance and plugins that deal with the backlinks.

This plugin the most likely will be useful for other plugin developers that deal with the backlinks.

Its idea came from the [forum](https://forum.obsidian.md/t/store-backlinks-in-metadatacache/67000).

If you need to call the original version, you can use `app.metadataCache.getBacklinksForFile.originalFunc` function.

## Installation

- `Backlink Cache` is available in [the official Community Plugins repository](https://obsidian.md/plugins).
- Beta releases can be installed through [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## Support

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;"></a>

## License

© [Michael Naumov](https://github.com/mnaoumov/)
