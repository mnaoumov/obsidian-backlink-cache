# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code
in this repository.

## Known Issues

### Bulk-deletion freeze: O(vault) per-call cost in the `getCache` patch's canvas check

First observed 2026-06-22 by CPU-profiling the real vault `F:\Obsidian` (~90k files)
while Advanced Exclude hid a large folder in `Full` mode. Hiding a folder makes Obsidian
run its internal `removeFile` cascade once per descendant file (~943 files in the test),
and for each one Obsidian's `MetadataCache.onDelete` reads the file's cache via
`getCache` (reached through `getFileCache`) — the method this plugin patches
(`src/patches/metadata-cache-get-cache-patch-component.ts`). The profile attributed
~11–12 s of the multi-plugin freeze to this plugin's frames.

The original hypothesis was that the patch does heavy reverse-index work per deleted
file (O(N × index)). The dedicated troubleshooting harness
(`src/bulk-delete.desktop-performance.integration.test.ts`) **disproves that** and
localizes the real cost. It deletes two identical folders of linking notes — one with
the plugin enabled, one disabled — and instruments the cascade.

**What the measurements show** (per-deleted-file, plugin-enabled vs Obsidian-native):

| vault size | native sync/file | patched sync/file | sync overhead | native getCache/call | patched getCache/call |
|------------|------------------|-------------------|---------------|----------------------|-----------------------|
| 300        | 4.16 ms          | 3.44 ms           | 0.83×         | 0.005 ms             | 0.13 ms               |
| 20 000     | 33.15 ms         | 32.63 ms          | 0.98×         | 0.005 ms             | 4.79 ms               |

1. **The plugin is not the bottleneck for a genuine delete cascade.** Net synchronous
   cascade time is the same with the plugin on or off (overhead factor ~0.8–1.0 across
   scales). The cascade is dominated by Obsidian's own native delete work, which is
   itself roughly O(vault): per-file cost rises from ~4 ms (300-file vault) to ~33 ms
   (20k-file vault) **even with the plugin disabled**. That native scaling is what froze
   the UI at 90k.
2. **The deferred debounced reverse-index batch is cheap** — it blocks the main thread
   for only ~3–16 ms total (it is an incremental per-path drop, not a rebuild). This
   directly refutes the "heavy reverse-index work per deleted file" hypothesis, and the
   harness has a tripwire that fails if that batch ever exceeds 2 s.
3. **But the patched `getCache` is far more expensive *per call* than native, and that
   per-call cost grows with vault size** (0.005 ms native and flat, vs 0.13 ms → 4.79 ms
   patched as the vault grows). The growth is entirely the patch's added work: its
   `isCanvasFile(app, path)` check (`metadata-cache-get-cache-patch-component.ts:31`)
   resolves the path via `getFileOrNull` → a **case-insensitive `getAbstractFileByPath`
   lookup that scales with vault size**. Native `getCache` is a flat O(1) map hit.

**Why the freeze still happened despite (1).** In a genuine delete cascade the O(vault)
per-call `getCache` overhead nets out against the time the `getBacklinksForFile` patch
*saves* elsewhere in `onDelete` (likely Obsidian's native backlink recompute). But any
caller that hits the patched `getCache`/`getFileCache` in a hot loop **without**
triggering that offsetting work pays the full per-call O(vault) cost. That is exactly
Advanced Exclude's **synthetic** hide path: it calls `getFileCache` per descendant to
remove the file from the index (the file still exists on disk), so it eats the
`isCanvasFile` vault scan ~943 times with nothing to offset it — the plugin's real,
fixable contribution to the freeze.

**Fix direction (revised):** make the `getCache` patch's canvas check **O(1)** — decide
whether to route to the canvas component by the path's extension *string* (e.g. a cheap
`.canvas` suffix check) instead of resolving the file through the case-insensitive
`getAbstractFileByPath` lookup. That removes the per-call vault scan entirely while
keeping routing behavior identical, since Obsidian always calls `getCache` with the
full file path. After the fix, add a tripwire to the harness asserting the patched
`getCache` per-call overhead stays flat (does not grow with vault size).
