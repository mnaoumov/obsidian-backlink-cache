import type { TFile } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The backlink index refreshes on AUTOMATIC triggers: a `modify`, a `changed`, a backlinks-pane
 * recompute. It used to read each note through `getCacheSafe`, which first saves any dirty open view
 * of that note — so every refresh forced a save of whatever the user, or another plugin, had just put
 * into the editor. A forced save one tick after another plugin's dispatch is what left Obsidian's
 * properties view rendering stale frontmatter in a sibling plugin.
 *
 * Two halves, both in a real Obsidian:
 * - a note whose file is rewritten with no editor involved still reaches the index, i.e. the
 *   `changed` Obsidian fires after re-parsing is enough without forcing the cache up to date. It also
 *   catches the old refresh's other flaw: it dropped a note's entries and then awaited the flushed
 *   cache, so a reader in that window saw the backlink missing, and the `changed` the flush itself
 *   fired queued the note again, opening another such window;
 * - a refresh of a note with a dirty editor leaves the file on disk untouched.
 */

interface SafeGetBacklinksForFile {
  (pathOrFile: string | TFile): unknown;
  safe: (pathOrFile: string | TFile) => Promise<unknown>;
}

const SOURCE_PATH = 'refresh-source.md';
const TARGET_PATH = 'refresh-target.md';
const DIRTY_MARKER = 'UNSAVED-EDITOR-MARKER';
// Two waits share one closure, and a closure is one transport call capped at 30 s, so each gets 10 s. The
// backlink appears within one poll (~0.4 s) when the fix holds.
const CACHE_WAIT_IN_MS = 10_000;
const CACHE_POLL_IN_MS = 200;
const SCENARIO_TIMEOUT_IN_MS = 90_000;

describe('backlink refresh reads the held cache and never saves the editor', () => {
  it('should index a rewritten note, and leave a dirty editor unsaved', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        CACHE_POLL_IN_MS: pollMs,
        CACHE_WAIT_IN_MS: waitMs,
        DIRTY_MARKER: dirtyMarker,
        obsidianModule,
        SOURCE_PATH: sourcePath,
        TARGET_PATH: targetPath
      }) {
        async function upsert(path: string, content: string): Promise<TFile> {
          const existing = app.vault.getFileByPath(path);
          if (existing) {
            await app.vault.modify(existing, content);
            return existing;
          }
          return app.vault.create(path, content);
        }

        async function doesHoldWithinWait(isDone: () => boolean): Promise<boolean> {
          const deadline = Date.now() + waitMs;
          while (!isDone() && Date.now() < deadline) {
            await sleep(pollMs);
          }
          return isDone();
        }

        const targetFile = await upsert(targetPath, 'target\n');
        const sourceFile = await upsert(sourcePath, 'no link yet\n');
        function hasBacklink(): boolean {
          return app.metadataCache.getBacklinksForFile(targetFile).keys().includes(sourcePath);
        }

        const isUnlinkedFirst = await doesHoldWithinWait(() => !hasBacklink());

        // Half 1: a plain rewrite, no editor. Only `modify` and the following `changed` can carry it.
        await app.vault.modify(sourceFile, `[[${targetPath.replace(/\.md$/u, '')}]]\n`);
        const isIndexedAfterRewrite = await doesHoldWithinWait(hasBacklink);

        // Half 2: a dirty editor on the source note, then an automatic refresh of it.
        const leaf = app.workspace.getLeaf('tab');
        await leaf.openFile(sourceFile);
        const view = leaf.view;
        if (!(view instanceof obsidianModule.MarkdownView)) {
          return { error: 'the source did not open in a MarkdownView' };
        }
        const diskBefore = await app.vault.adapter.read(sourcePath);
        view.editor.setValue(`${diskBefore}${dirtyMarker}\n`);

        // What `modify` does to the index, run to completion now rather than after the 500 ms debounce,
        // and well inside Obsidian's own ~2 s autosave, so any save seen here is the refresh's.
        app.vault.trigger('modify', sourceFile);
        await (app.metadataCache.getBacklinksForFile as SafeGetBacklinksForFile).safe(targetFile);
        const diskAfterRefresh = await app.vault.adapter.read(sourcePath);

        // Put the editor back to what is on disk, so the autosave cannot leave the marker behind.
        view.editor.setValue(diskBefore);
        await view.save();
        leaf.detach();

        return {
          error: null,
          isIndexedAfterRewrite,
          isUnlinkedFirst,
          wasEditorSaved: diskAfterRefresh.includes(dirtyMarker)
        };
      },
      input: {
        CACHE_POLL_IN_MS,
        CACHE_WAIT_IN_MS,
        DIRTY_MARKER,
        SOURCE_PATH,
        TARGET_PATH
      },
      vaultPath: getTemporaryVault().path
    });

    // One matcher, so a failure shows every flag at once.
    expect(result).toMatchObject({
      error: null,
      isIndexedAfterRewrite: true,
      isUnlinkedFirst: true,
      wasEditorSaved: false
    });
  }, SCENARIO_TIMEOUT_IN_MS);
});
