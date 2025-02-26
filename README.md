# Backlink Cache

This is a plugin for [Obsidian](https://obsidian.md/) that maintains backlink cache to speed up undocumented `app.metadataCache.getBacklinksForFile` function.

It's mostly useful for users with the large vaults. On smaller vaults the difference might be unnoticeable.

It speeds up `Backlinks Pane` performance and plugins that deal with the backlinks.

This plugin the most likely will be useful for other plugin developers that deal with the backlinks.

Its idea came from the [forum](https://forum.obsidian.md/t/store-backlinks-in-metadatacache/67000).

Also the plugin includes canvas into the backlinks for the referenced files. This includes the `app.metadataCache.getBacklinksForFile` function and the `Backlinks Pane`.

## Usage

### Fast version

The provided version is faster than the built-in version. Also the overload to accept `path` was added.

```js
const backlinks1 = app.metadataCache.getBacklinksForFile(file);
const backlinks2 = app.metadataCache.getBacklinksForFile(path);
```

### Safe version

If you want to ensure the all recent file changes are processed and the backlinks are 100% accurate.

```js
const backlinks1 = await app.metadataCache.getBacklinksForFile.safe(file);
const backlinks2 = await app.metadataCache.getBacklinksForFile.safe(path);
```

### Original version

You can access the original built-in version:

```js
const backlinks = app.metadataCache.getBacklinksForFile.originalFn(file);
```

### TypeScript typings

If you want to use the updated functions from your plugin, you can copy [types.d.ts](./types.d.ts) into your code.

### Canvas backlinks

The plugin handles links from the canvas file/text cards if [`Canvas`](https://help.obsidian.md/plugins/canvas) core plugin is enabled.

### Backlinks panel

The plugin speeds up the Backlinks panel if [`Backlinks`](https://help.obsidian.md/plugins/backlinks) core plugin is enabled.

### Frontmatter markdown links

The plugin includes backlinks from the frontmatter markdown links if [`Frontmatter Markdown Links`](https://obsidian.md/plugins?id=frontmatter-markdown-links) community plugin is enabled. Example of such link:

```md
---
key: "[title](path/to/link.md)"
---
```

## Installation

- The plugin is available in [the official Community Plugins repository](https://obsidian.md/plugins?id=backlink-cache).
- [Beta releases](obsidian://brat?plugin=https://github.com/mnaoumov/obsidian-backlink-cache) can be installed via [BRAT](https://obsidian.md/plugins?id=obsidian42-brat).

## Debugging

By default, debug messages for this plugin are hidden.

To show them, run the following command:

```js
window.DEBUG.enable('backlink-cache');
```

For more details, refer to the [documentation](https://github.com/mnaoumov/obsidian-dev-utils?tab=readme-ov-file#debugging).

## Support

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;"></a>

## License

© [Michael Naumov](https://github.com/mnaoumov/)
