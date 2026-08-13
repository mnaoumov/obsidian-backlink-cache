# Backlink cache

Obsidian resolves backlinks with the undocumented `app.metadataCache.getBacklinksForFile()` function. **Backlink Cache** keeps a live index of every link in the vault and answers that call from the index, so it stays fast even when the vault grows to thousands of notes.

This vault has a small web of notes that all point at [Central topic](<./Topics/Central topic.md>):

- [Research note](<./Topics/Research note.md>) links to [Central topic](<./Topics/Central topic.md>) and [Reading list](<./Topics/Reading list.md>).
- [Meeting note](<./Topics/Meeting note.md>) links to [Central topic](<./Topics/Central topic.md>) and [Research note](<./Topics/Research note.md>).
- [Reading list](<./Topics/Reading list.md>) links to [Central topic](<./Topics/Central topic.md>).

## Try it

The button below asks the cache for the backlinks of [Central topic](<./Topics/Central topic.md>) and lists the notes that link to it. With the plugin enabled, the answer comes straight from the cache. It also uses the **path-string** overload the plugin adds - `getBacklinksForFile('Topics/Central topic.md')` - since the built-in version only accepts a `TFile`.

```code-button
---
caption: Show cached backlinks for Central topic
---
import { Notice } from 'obsidian';
const dict = app.metadataCache.getBacklinksForFile('Topics/Central topic.md');
const paths = dict.keys();
new Notice(`Backlink Cache served ${paths.length.toString()} backlink(s):\n${paths.join('\n')}`);
```

Open the core **Backlinks** pane on [Central topic](<./Topics/Central topic.md>) and you will see the same list - Backlink Cache is what keeps that pane fast in a large vault.

> [!NOTE] Honest expectations
>
> In this tiny vault the cached lookup and the built-in scan are both instant. The cache pays off in **large** vaults, where rescanning every link on each query gets slow.
