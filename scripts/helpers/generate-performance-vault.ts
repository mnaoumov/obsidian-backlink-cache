import type { PopulateFilesParams } from 'obsidian-integration-testing';

/**
 * The link target every linker note points at. The
 * `update-related-links.desktop-performance.integration.test.ts` test calls
 * `updateRelatedLinks` with this note's basename, so the two must agree.
 */
export const PERFORMANCE_VAULT_TARGET = 'target.md';

/**
 * Folder holding the notes that link to {@link PERFORMANCE_VAULT_TARGET}. These are
 * the only files a correct `updateRelatedLinks(['target.md'])` should queue.
 */
export const PERFORMANCE_VAULT_LINKER_FOLDER = 'links';

/**
 * How many notes link to {@link PERFORMANCE_VAULT_TARGET}.
 */
export const PERFORMANCE_VAULT_LINKER_COUNT = 50;

/**
 * Folder holding the bulk of unrelated filler notes (no links). Their count is what
 * Obsidian's original `updateRelatedLinks` would scan via `getCachedFiles`; the
 * patch must ignore them entirely.
 */
export const PERFORMANCE_VAULT_FILLER_FOLDER = 'big';

/**
 * Link target every note in the bulk-delete folders points at. Kept separate from
 * {@link PERFORMANCE_VAULT_TARGET} so the bulk-delete notes do not perturb the
 * `target.md` backlink count the other performance tests assert on.
 */
export const PERFORMANCE_VAULT_DELETE_TARGET = 'delete-target.md';

/**
 * Two equal-sized folders of notes that link to {@link PERFORMANCE_VAULT_DELETE_TARGET}.
 * The bulk-deletion troubleshooting test deletes folder A with the plugin enabled and
 * folder B with it disabled, so the per-delete cost of the `getCache` patch can be
 * compared against Obsidian's native delete cascade on an identical file set.
 */
export const PERFORMANCE_VAULT_DELETE_FOLDER_A = 'to-delete-a';
export const PERFORMANCE_VAULT_DELETE_FOLDER_B = 'to-delete-b';

// Large enough that an O(vault) scan would be obvious; overridable via
// BC_PERF_VAULT_SIZE for bounded runs (e.g. 2000 for a quick check, 90000 for real scale).
const DEFAULT_PERFORMANCE_VAULT_SIZE = 90_000;
const PERFORMANCE_VAULT_SIZE = Number(process.env['BC_PERF_VAULT_SIZE']) || DEFAULT_PERFORMANCE_VAULT_SIZE;
const FILES_PER_FOLDER = 30;

/**
 * How many notes each bulk-delete folder holds. Close to the ~943-file cascade
 * measured in the real freeze; overridable via `BC_PERF_DELETE_COUNT` for quick runs.
 */
const DEFAULT_PERFORMANCE_VAULT_DELETE_COUNT = 1_000;
export const PERFORMANCE_VAULT_DELETE_COUNT = Number(process.env['BC_PERF_DELETE_COUNT']) || DEFAULT_PERFORMANCE_VAULT_DELETE_COUNT;

/**
 * Builds the file map for a large vault, written to disk by `TempVault.populate()`
 * before Obsidian opens it (so its startup scan indexes it in one pass). The vault
 * contains one link {@link PERFORMANCE_VAULT_TARGET}, {@link PERFORMANCE_VAULT_LINKER_COUNT}
 * notes that resolve-link to it, and a large filler folder of unrelated notes.
 *
 * @returns A map of vault-relative note paths to content.
 */
export function generatePerformanceVault(): PopulateFilesParams {
  const files: PopulateFilesParams = {
    [PERFORMANCE_VAULT_DELETE_TARGET]: '',
    [PERFORMANCE_VAULT_TARGET]: ''
  };

  for (let linkerIndex = 0; linkerIndex < PERFORMANCE_VAULT_LINKER_COUNT; linkerIndex++) {
    files[`${PERFORMANCE_VAULT_LINKER_FOLDER}/link-${String(linkerIndex)}.md`] = '[[target]]\n';
  }

  for (const deleteFolder of [PERFORMANCE_VAULT_DELETE_FOLDER_A, PERFORMANCE_VAULT_DELETE_FOLDER_B]) {
    for (let deleteIndex = 0; deleteIndex < PERFORMANCE_VAULT_DELETE_COUNT; deleteIndex++) {
      files[`${deleteFolder}/del-${String(deleteIndex)}.md`] = '[[delete-target]]\n';
    }
  }

  let written = 0;
  let folderIndex = 0;
  while (written < PERFORMANCE_VAULT_SIZE) {
    for (let fileIndex = 0; fileIndex < FILES_PER_FOLDER && written < PERFORMANCE_VAULT_SIZE; fileIndex++) {
      files[`${PERFORMANCE_VAULT_FILLER_FOLDER}/dir-${String(folderIndex)}/file-${String(fileIndex)}.md`] = '';
      written++;
    }
    folderIndex++;
  }

  return files;
}
