import type {
  Reference,
  TFile
} from 'obsidian';
import type { CustomArrayDict } from 'obsidian-typings';

/**
 * Extended implementation of the `app.metadataCache.getBacklinksForFile` method from Obsidian.
 *
 * Usages:
 * - `(app.metadataCache.getBacklinksForFile as GetBacklinksForFileFn)(pathOrFile)`
 * - `(app.metadataCache.getBacklinksForFile as GetBacklinksForFileFn).originalFn(file)`
 * - `(app.metadataCache.getBacklinksForFile as GetBacklinksForFileFn).safe(pathOrFile)`
 */
interface GetBacklinksForFileFn {
  /**
   * Fast implementation that might be inconsistent if the file changes are not processed yet.
   *
   * @param pathOrFile - The path or file to get the backlinks for.
   * @returns The backlinks for the file.
   */
  (pathOrFile: string | TFile): CustomArrayDict<Reference>;

  /**
   * Original implementation from Obsidian.
   *
   * @param file - The file to get the backlinks for.
   * @returns The backlinks for the file.
   */
  originalFn(file: TFile): CustomArrayDict<Reference>;

  /**
   * Safe asynchronous implementation that waits for the file changes to be processed.
   *
   * @param pathOrFile - The path or file to get the backlinks for.
   * @returns The backlinks for the file.
   */
  safe(pathOrFile: string | TFile): Promise<CustomArrayDict<Reference>>;
}
