[Docs](https://github.com/mnaoumov/obsidian-backlink-cache/)

# Fast, safe, and original backlinks

Backlink Cache extends `app.metadataCache.getBacklinksForFile` with three ways to call it. The fast and safe versions accept a `TFile` **or** a vault path string; the original accepts a `TFile`.

- **Fast** - `getBacklinksForFile(pathOrFile)` reads straight from the cache. It is the fastest, and may be momentarily stale if a note changed a split second ago.
- **Safe** - `await getBacklinksForFile.safe(pathOrFile)` waits for any pending changes to be processed first, so the result is guaranteed current.
- **Original** - `getBacklinksForFile.originalFn(file)` calls Obsidian's built-in implementation, bypassing the cache (handy for comparison).

## Try it

The button runs all three against [[Central topic]] and reports how many backlinks each one found. In this small, settled vault they agree - the difference is about *speed* and *freshness guarantees*, not the result.

```code-button
---
caption: Compare fast, safe, and original backlinks
---
import { Notice } from 'obsidian';
const path = 'Topics/Central topic.md';
const getBacklinksForFile = app.metadataCache.getBacklinksForFile;
const fast = getBacklinksForFile(path).count();
const safe = (await getBacklinksForFile.safe(path)).count();
const original = getBacklinksForFile.originalFn(app.vault.getFileByPath(path)).count();
new Notice([
  `fast:     ${fast.toString()}`,
  `safe:     ${safe.toString()}`,
  `original: ${original.toString()}`
].join('\n'));
```

See [[04 Settings]] for the options that control refresh behavior.
