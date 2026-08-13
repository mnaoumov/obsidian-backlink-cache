# Canvas backlinks

Backlink Cache includes **canvas** (`.canvas`) files in the backlink index, so a note referenced from a canvas card shows up in its backlinks just like a note referenced from Markdown.

This vault ships [Canvas map](<./Topics/Canvas map.canvas>) - a canvas whose cards reference [Central topic](<./Topics/Central topic.md>): one **file card** that embeds the note and one **text card** that contains a `[[Central topic]]` link.

## Try it

The button asks the cache for the backlinks of [Central topic](<./Topics/Central topic.md>) and lists the ones that come from a canvas file.

```code-button
---
caption: Show canvas backlinks for Central topic
---
import { Notice } from 'obsidian';
const dict = app.metadataCache.getBacklinksForFile('Topics/Central topic.md');
const canvasSources = dict.keys().filter((path) => path.endsWith('.canvas'));
new Notice(`Central topic has ${canvasSources.length.toString()} canvas backlink source(s):\n${canvasSources.join('\n')}`);
```

Open the core **Backlinks** pane on [Central topic](<./Topics/Central topic.md>) and the canvas file appears in the list.

> [!NOTE] getCache for canvas
>
> Obsidian resolves canvas backlinks natively (Backlinks pane, graph, `getBacklinksForFile`, `resolvedLinks`), but it leaves `app.metadataCache.getCache()` empty for a canvas file. Backlink Cache additionally fills that per-file cache, so tools that read `getCache()` for a canvas still see its links.

```code-button
---
caption: Show getCache links for the canvas
---
import { Notice } from 'obsidian';
const cache = app.metadataCache.getCache('Topics/Canvas map.canvas');
const links = cache?.frontmatterLinks ?? [];
new Notice(`getCache('Topics/Canvas map.canvas') exposes ${links.length.toString()} link(s):\n${links.map((link) => link.link).join('\n')}`);
```

See [04 Settings](<./04 Settings.md>) for the options that control refresh behavior.
