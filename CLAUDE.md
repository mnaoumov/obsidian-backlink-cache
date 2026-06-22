# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code
in this repository.

## Known Issues

### Bulk-deletion freeze: O(vault) `getCache` miss-scan via `isCanvasFile` (RESOLVED 2026-06-22)

First observed by CPU-profiling the real vault `F:\Obsidian` (~90k files) while Advanced
Exclude hid a large folder in `Full` mode. Hiding a folder makes Obsidian run its internal
`removeFile` cascade once per descendant file (~943 files), and Advanced Exclude also calls
`getFileCache` per descendant to drop it from the index. Both reach this plugin's `getCache`
patch (`src/patches/metadata-cache-get-cache-patch-component.ts`). The profile attributed
~11–12 s of the multi-plugin freeze to this plugin's frames.

**Root cause (measured, not guessed).** The patch decided canvas routing with
`isCanvasFile(app, path)`, which resolves the path via a **case-insensitive
`getAbstractFileByPath` lookup**. That lookup is O(1) on a *hit* but does an **O(vault) scan
on a *miss*** — and during/after deletion (real or synthetic) the path is exactly a miss. So
the patched `getCache` became **O(vault) per call**: measured ~4.5 ms/call at 20k files vs
~0.0005 ms native, scaling linearly with vault size.

Why it surfaced as a freeze despite the plugin elsewhere *saving* time: in a genuine delete
cascade the per-call miss-scan partly nets out against the work the `getBacklinksForFile`
patch saves (net sync cascade time enabled ≈ disabled). But a hot-loop caller that hits
`getCache`/`getFileCache` on already-removed paths **without** triggering that offsetting
work — Advanced Exclude's synthetic hide, ~943 calls — pays the full O(vault) cost with
nothing to offset it. (The deferred debounced reverse-index batch was never the problem; it
blocks only ~3–16 ms — the original "heavy reverse-index work per deleted file" hypothesis
was wrong.)

**Fix.** Route canvas files by the path's `.canvas` extension *string* (O(1)) instead of
resolving the file. `getCache` is always called with the canonical file path, so the routing
decision is identical, and both hits and misses are now O(1) (~0.0005 ms/call at 20k).

**Guarded by** (real-Obsidian `*.desktop-performance.integration.test.ts`, run manually with
`BC_PERF_VAULT_SIZE` / `BC_PERF_DELETE_COUNT`):

- `get-cache-patch-overhead.desktop-performance.integration.test.ts` — asserts patched
  `getCache` stays sub-millisecond per call (incl. the missing-path case) and flat across
  vault sizes; fires if routing ever resolves the file again.
- `bulk-delete.desktop-performance.integration.test.ts` — full cascade breakdown (enabled vs
  disabled), with tripwires on per-file sync overhead and the deferred batch's block time.
