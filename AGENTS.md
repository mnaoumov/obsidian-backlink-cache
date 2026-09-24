# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Invariant: a self-link is never indexed as a re-resolution source

`BacklinkCacheComponent.refreshBacklinks` records a self-link as a **backlink** (so the panel shows it) but deliberately skips adding it to `resolvedBasenameMap`.

`resolvedBasenameMap` answers "when a file with this basename changes, which notes must be re-resolved?". Including the changed note itself is vacuous — whatever produced the change already resolved it — and it is actively harmful here, because this plugin **replaces** `metadataCache.updateRelatedLinks` rather than calling through. A self-entry makes that replacement queue the note for re-resolution in response to its own change, which fires `changed`, which refreshes its backlinks, which queues it again. That feedback cycle is issue #17: a note with 72 self-links stalled the editor for 20-30 seconds. Each pass is linear in the self-link count, so the cost is the number of passes, not a quadratic per pass.

This is the **one deliberate departure** from the original Obsidian algorithm. The differential-parity oracle in `backlink-cache-component.test.ts` models the original faithfully, and the original *would* queue the note; a dedicated test in that suite pins the divergence so the parity claim stays honest. Queuing strictly less is safe.

Before changing anything in this area, read that parity suite — its cases encode which behaviors are guaranteed to match Obsidian exactly.

## Invariant: a backlink refresh never saves the editor

`BacklinkCacheComponent.refreshBacklinks` reads `metadataCache.getFileCache`, the cache Obsidian already holds, and is synchronous. It must not go back to `getCacheSafe`: that saves any dirty open view of the note first, and every refresh runs on an automatic trigger (`modify`, `changed`, a backlinks-pane recompute), so it forced a save of whatever the user or another plugin had just put into the editor. It also dropped the note's entries and then awaited, so a reader in that window saw backlinks missing.

A `modify` refresh may read the pre-edit cache; the `changed` Obsidian fires after re-parsing queues the note again and fixes it. That is why the listeners are registered before the initial walk, which also waits for `ensureMetadataCacheReady`. `refresh-does-not-save-editor.desktop.integration.test.ts` pins both halves in a real Obsidian and fails on the old code.
