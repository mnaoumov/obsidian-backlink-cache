/**
 * @file
 *
 * Produces the mobile screenshots the community-store listing needs (T461-P21),
 * driving Obsidian Mobile on a real Android emulator and writing
 * `images/screenshots/screenshot-mobile-N.png`.
 *
 * Worth taking on a phone because that is where the cost is felt first: the same
 * scan that is merely slow on a laptop is what makes the Backlinks pane sit and
 * think on a phone. The vault here is smaller than the desktop one — every note
 * has to be pushed onto the device before Obsidian opens it — and the difference
 * is measured on the device anyway, so the numbers in frame are the phone's.
 *
 * The numbers in frame are measured in that vault, in the same run, on the same
 * note: the patched lookup, then Obsidian's own implementation reached through
 * `getBacklinksForFile.originalFn`. Nothing is quoted from a benchmark elsewhere,
 * and the assertion requires the patched path to actually be faster before the
 * frame claiming so is written.
 */

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { sleep as sleepInNode } from 'obsidian-dev-utils/async';
import {
  captureObsidianScreenshot,
  evalInObsidian,
  labelScreenshot,
  readPngDimensions
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

/**
 * The dictionary either implementation answers with, reduced to its keys.
 */
interface BacklinkDictionary {
  keys(this: void): string[];
}

/**
 * `App`, reduced to the font-size applier that `obsidian-typings` does not
 * declare. Setting `baseFontSize` alone changes nothing on screen.
 */
interface FontSizeApp {
  updateFontSize(this: void): void;
}

/**
 * `App`, reduced to the inline-title toggle that `obsidian-typings` does not
 * declare. Setting the config alone changes nothing on screen.
 */
interface InlineTitleApp {
  updateInlineTitleDisplay(this: void): void;
}

/**
 * The backlink lookup as this plugin leaves it: callable as before, plus the
 * `originalFn` handle onto Obsidian's own implementation, which is what makes a
 * fair side-by-side measurement possible at all.
 */
interface PatchedGetBacklinksForFile {
  (this: void, file: unknown): BacklinkDictionary;
  // eslint-disable-next-line unicorn/name-replacements -- `originalFn` is the plugin's own public property name, not ours to rename.
  originalFn(this: void, file: unknown): BacklinkDictionary;
}

const WIDTH_IN_PIXELS = 900;
const HEIGHT_IN_PIXELS = 1600;

/**
 * The note everything points at, and the folder the pointing notes live in.
 */
const HUB_NOTE_PATH = 'Projects/Website redesign.md';
const LINKING_FOLDER = 'Journal';

/**
 * How many notes link to the hub. Enough that the Backlinks pane is worth looking
 * at, and enough that Obsidian's own scan has something to do.
 */
const LINKING_NOTE_COUNT = 120;

/**
 * How many other notes the vault holds. This is the only reason any of this is
 * worth measuring: the plugin answers from an index, so its cost does not move
 * with this number, while Obsidian's own implementation walks all of it.
 */
const FILLER_NOTE_COUNT = 400;

/**
 * How many linking notes may fail to reach the device before the run is wrong
 * rather than merely unlucky.
 */
const MISSING_NOTE_TOLERANCE = 3;

/**
 * How much faster the cached lookup has to be before a frame may say so.
 */
const REQUIRED_SPEEDUP = 2;

/**
 * Where the measured numbers are written so they can be photographed. A `Notice`
 * would be the obvious place and is out of reach: a serialized closure has no
 * imports, so it cannot construct one.
 */
const RESULT_NOTE_PATH = 'Measurements.md';

/**
 * Base font size for the mobile shots.
 */
const MOBILE_FONT_SIZE_IN_PIXELS = 13;

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

/**
 * The measurement, taken once and reused by the frames that report it.
 */
let measurement: BacklinkMeasurement | null = null;

beforeAll(async () => {
  const vault = getTemporaryVault();

  vault.populate(buildVault());
  await vault.syncToDevice();

  await evalInObsidian({
    async callback({ app, fontSizeInPixels, hubNotePath, lib: { waitUntil }, linkingNoteCount }) {
      const INDEX_TIMEOUT_IN_MILLISECONDS = 25_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;

      app.changeTheme('obsidian');

      await waitUntil({
        message: 'the staged vault to appear',
        predicate: () => Boolean(app.vault.getFileByPath(hubNotePath)),
        timeoutInMilliseconds: INDEX_TIMEOUT_IN_MILLISECONDS
      });

      // The drawer foot shows the harness generated vault name, which belongs in
      // No listing.
      const style = createEl('style');
      style.textContent = '.workspace-drawer-vault-switcher, .workspace-drawer-header-switcher { visibility: hidden; }';
      document.head.append(style);

      app.vault.setConfig('baseFontSize', fontSizeInPixels);
      const fontApp: unknown = app;
      (fontApp as FontSizeApp).updateFontSize();

      app.vault.setConfig('showInlineTitle', false);
      const inlineTitleApp: unknown = app;
      (inlineTitleApp as InlineTitleApp).updateInlineTitleDisplay();

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return { linkingNoteCount };
    },
    input: { fontSizeInPixels: MOBILE_FONT_SIZE_IN_PIXELS, hubNotePath: HUB_NOTE_PATH, linkingNoteCount: LINKING_NOTE_COUNT },
    vaultPath: vaultPath()
  });

  // Indexing thousands of notes takes Obsidian a while, and every frame below is
  // Meaningless until it has finished — a Backlinks pane that is still filling in
  // Photographs as a plugin that found nothing.
  await waitForIndex();
});

describe('mobile store screenshots', () => {
  it('1 - the backlinks of a note in a big vault', async () => {
    const backlinkCount = await openBacklinksPane();
    // Not an exact count: pushing a few hundred notes onto the device drops the
    // Odd one, and a frame is not worth failing over one journal entry. The
    // Caption says no number for the same reason.
    expect(backlinkCount).toBeGreaterThanOrEqual(LINKING_NOTE_COUNT - MISSING_NOTE_TOLERANCE);
    await shoot(1, 'Every backlink of this note, in one list');
  });

  it('2 - how long each way takes', async () => {
    measurement = await measureBacklinkLookups();
    // The frame reports numbers; this is what stops it reporting a lie.
    expect(measurement.cachedInMilliseconds).toBeLessThan(measurement.originalInMilliseconds / REQUIRED_SPEEDUP);
    await shoot(2, 'From an index, not a scan of every note');
  });

  it('3 - the same answer, either way', async () => {
    const counts = await compareBacklinkCounts();
    // Faster is only worth anything if it is also right. The two implementations
    // Must agree exactly; what that agreed number is does not matter here.
    expect(counts.cached).toBe(counts.original);
    expect(counts.cached).toBeGreaterThanOrEqual(LINKING_NOTE_COUNT - MISSING_NOTE_TOLERANCE);
    await shoot(3, 'Same answer as Obsidian, arrived at faster');
  });
});

/**
 * Builds the vault the shots are taken in.
 *
 * Named like a vault someone actually keeps: the frames show the file explorer,
 * and `big/dir-3/file-17.md` would photograph as a benchmark rather than as the
 * situation the reader is in.
 *
 * @returns A map of vault-relative paths to content.
 */
function buildVault(): Record<string, string> {
  const files: Record<string, string> = {
    [HUB_NOTE_PATH]: '# Website redesign\n\nThe project everything else refers back to.\n'
  };

  const topics = ['Standup', 'Review', 'Retro', 'Planning', 'Handover'];

  for (let index = 0; index < LINKING_NOTE_COUNT; index++) {
    const topic = topics[index % topics.length] ?? 'Standup';
    const day = (index % 28) + 1;
    const month = (index % 12) + 1;
    const paddedMonth = String(month).padStart(2, '0');
    const paddedDay = String(day).padStart(2, '0');
    files[`${LINKING_FOLDER}/2026-${paddedMonth}/2026-${paddedMonth}-${paddedDay} ${topic}.md`] = `# ${topic}\n\nPicked up again on [[Website redesign]].\n`;
  }

  // The filler notes LINK to each other. An empty note costs Obsidian's own
  // Implementation nothing to walk, so a vault of empty notes would have measured
  // A difference that no reader's vault would reproduce — real vaults are full of
  // Links, and links are what that implementation re-reads on every question.
  for (let index = 0; index < FILLER_NOTE_COUNT; index++) {
    const folder = `Archive/${String(2010 + (index % 15))}`;
    const firstNeighbor = (index + 1) % FILLER_NOTE_COUNT;
    const secondNeighbor = (index + 7) % FILLER_NOTE_COUNT;
    files[`${folder}/Note ${String(index)}.md`] = [
      `# Note ${String(index)}`,
      '',
      `Older material. See also [[Note ${String(firstNeighbor)}]] and [[Note ${String(secondNeighbor)}]].`,
      ''
    ].join('\n');
  }

  return files;
}

/**
 * Asks for the backlink count both ways.
 *
 * @returns What each implementation answered.
 */
async function compareBacklinkCounts(): Promise<BacklinkCounts> {
  return await evalInObsidian({
    async callback({ app, hubNotePath, resultNotePath }) {
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);

      // Shot 1 left a Backlinks tab and an expanded right dock behind. They would
      // Sit in this frame reporting "No backlinks found" for the results note,
      // Which is true and completely beside the point.
      for (const backlinkLeaf of app.workspace.getLeavesOfType('backlink')) {
        backlinkLeaf.detach();
      }

      app.workspace.rightSplit.collapse();
      app.workspace.leftSplit.collapse();

      /**
       * Writes the measured numbers into a note and opens it, which is what the
       * shot photographs. Defined here rather than at module scope because a
       * serialized closure carries no outer functions with it.
       *
       * @param lines - The note's Markdown, line by line.
       */
      async function writeResultNote(lines: string[]): Promise<void> {
        const content = lines.join('\n');
        const existing = app.vault.getFileByPath(resultNotePath);
        const resultFile = existing ?? await app.vault.create(resultNotePath, content);
        if (existing) {
          await app.vault.modify(existing, content);
        }

        await app.workspace.getLeaf(false).openFile(resultFile);
        await app.workspace.getLeaf(false).setViewState({
          state: { file: resultNotePath, mode: 'preview', source: false },
          type: 'markdown'
        });
      }

      const file = app.vault.getFileByPath(hubNotePath);
      if (!file) {
        throw new Error(`Note is missing from the vault: ${hubNotePath}`);
      }

      const lookup: unknown = app.metadataCache.getBacklinksForFile;
      const getBacklinksForFile = lookup as PatchedGetBacklinksForFile;
      const cached = getBacklinksForFile(file).keys().length;
      const original = getBacklinksForFile.originalFn(file).keys().length;

      await writeResultNote([
        '# Backlinks for Website redesign',
        '',
        '| Asked | Answer |',
        '| --- | --- |',
        `| From the cache | ${String(cached)} backlinks |`,
        `| Obsidian's own | ${String(original)} backlinks |`
      ]);

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return { cached, original };
    },
    input: { hubNotePath: HUB_NOTE_PATH, resultNotePath: RESULT_NOTE_PATH },
    vaultPath: vaultPath()
  });
}

/**
 * Times both implementations over the same note.
 *
 * @returns The two timings, in milliseconds.
 */
async function measureBacklinkLookups(): Promise<BacklinkMeasurement> {
  return await evalInObsidian({
    async callback({ app, hubNotePath, iterations, resultNotePath }) {
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);

      // Shot 1 left a Backlinks tab and an expanded right dock behind. They would
      // Sit in this frame reporting "No backlinks found" for the results note,
      // Which is true and completely beside the point.
      for (const backlinkLeaf of app.workspace.getLeavesOfType('backlink')) {
        backlinkLeaf.detach();
      }

      app.workspace.rightSplit.collapse();
      app.workspace.leftSplit.collapse();

      /**
       * Writes the measured numbers into a note and opens it, which is what the
       * shot photographs. Defined here rather than at module scope because a
       * serialized closure carries no outer functions with it.
       *
       * @param lines - The note's Markdown, line by line.
       */
      async function writeResultNote(lines: string[]): Promise<void> {
        const content = lines.join('\n');
        const existing = app.vault.getFileByPath(resultNotePath);
        const resultFile = existing ?? await app.vault.create(resultNotePath, content);
        if (existing) {
          await app.vault.modify(existing, content);
        }

        await app.workspace.getLeaf(false).openFile(resultFile);
        await app.workspace.getLeaf(false).setViewState({
          state: { file: resultNotePath, mode: 'preview', source: false },
          type: 'markdown'
        });
      }

      const file = app.vault.getFileByPath(hubNotePath);
      if (!file) {
        throw new Error(`Note is missing from the vault: ${hubNotePath}`);
      }

      const lookup: unknown = app.metadataCache.getBacklinksForFile;
      const getBacklinksForFile = lookup as PatchedGetBacklinksForFile;

      function measure(run: () => void): number {
        const start = performance.now();
        for (let iteration = 0; iteration < iterations; iteration++) {
          run();
        }

        return (performance.now() - start) / iterations;
      }

      const cachedInMilliseconds = measure(() => {
        getBacklinksForFile(file);
      });
      const originalInMilliseconds = measure(() => {
        getBacklinksForFile.originalFn(file);
      });

      await writeResultNote([
        `# Backlinks for ${file.basename}`,
        '',
        `Averaged over ${String(iterations)} calls, in a vault of ${String(app.vault.getMarkdownFiles().length)} notes.`,
        '',
        '| Asked | Time |',
        '| --- | --- |',
        `| From the cache | ${cachedInMilliseconds.toFixed(3)} ms |`,
        `| Obsidian's own | ${originalInMilliseconds.toFixed(3)} ms |`
      ]);

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return { cachedInMilliseconds, originalInMilliseconds };
    },
    input: { hubNotePath: HUB_NOTE_PATH, iterations: MEASUREMENT_ITERATIONS, resultNotePath: RESULT_NOTE_PATH },
    vaultPath: vaultPath()
  });
}

/**
 * Opens the hub note with the Backlinks pane beside it.
 *
 * @returns How many backlinks the pane is showing.
 */
async function openBacklinksPane(): Promise<number> {
  return await evalInObsidian({
    async callback({ app, hubNotePath, lib: { waitUntil } }) {
      const RENDER_TIMEOUT_IN_MILLISECONDS = 25_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 2000;

      const file = app.vault.getFileByPath(hubNotePath);
      if (!file) {
        throw new Error(`Note is missing from the vault: ${hubNotePath}`);
      }

      await app.workspace.getLeaf(false).openFile(file);

      // ONE pane, in the right dock where Obsidian normally keeps it. The
      // `backlink:open-backlinks` command opens a second one as a tab in the main
      // Area, and a frame showing the same list twice reads as a mistake.
      for (const staleLeaf of app.workspace.getLeavesOfType('backlink')) {
        staleLeaf.detach();
      }

      app.workspace.rightSplit.expand();
      const backlinkLeaf = app.workspace.getRightLeaf(false);
      if (!backlinkLeaf) {
        throw new Error('Obsidian offered no right-dock leaf for the backlinks pane.');
      }

      await backlinkLeaf.setViewState({ active: true, type: 'backlink' });
      await app.workspace.revealLeaf(backlinkLeaf);

      // The file explorer would otherwise take a third of the frame for folders
      // Nobody is reading.
      app.workspace.leftSplit.collapse();

      await waitUntil({
        message: 'the backlinks pane to fill',
        predicate: () => document.querySelectorAll('.backlink-pane .search-result-file-title').length > 0,
        timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return app.metadataCache.getBacklinksForFile(file).keys().length;
    },
    input: { hubNotePath: HUB_NOTE_PATH },
    vaultPath: vaultPath()
  });
}

/**
 * Captures the window, captions it, and writes it as
 * `images/screenshots/screenshot-mobile-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const captured = await captureObsidianScreenshot({ vaultPath: vaultPath() });

  // The AVD is 900x1600, so the device frame IS the store's size. Asserting it
  // Here is what keeps that true: run this against any other AVD and it fails
  // Loudly instead of quietly shipping an off-spec image.
  expect(readPngDimensions(captured)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  const labeled = await labelScreenshot(captured, { text: caption });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-mobile-${String(index)}.png`), labeled);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

/**
 * Waits for the plugin's index to hold every linking note.
 *
 * Polled from the Node side: indexing thousands of notes outlasts the transport's
 * per-call cap, and a frame taken before it settles shows a half-built pane.
 */
async function waitForIndex(): Promise<void> {
  const ATTEMPTS = 140;
  const INTERVAL_IN_MILLISECONDS = 3000;

  let lastCount = 0;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const count = await evalInObsidian({
      callback({ app, hubNotePath }) {
        const file = app.vault.getFileByPath(hubNotePath);
        return file ? app.metadataCache.getBacklinksForFile(file).keys().length : 0;
      },
      input: { hubNotePath: HUB_NOTE_PATH },
      vaultPath: vaultPath()
    });

    if (count >= LINKING_NOTE_COUNT || (count === lastCount && count >= LINKING_NOTE_COUNT - MISSING_NOTE_TOLERANCE)) {
      return;
    }

    lastCount = count;

    await sleepInNode({ milliseconds: INTERVAL_IN_MILLISECONDS });
  }

  throw new Error(`The vault never finished indexing. Last backlink count: ${String(lastCount)} of ${String(LINKING_NOTE_COUNT)}.`);
}

/**
 * How many times each implementation is called before its average is taken.
 */
const MEASUREMENT_ITERATIONS = 20;

/**
 * What each implementation answered.
 */
interface BacklinkCounts {
  readonly cached: number;
  readonly original: number;
}

/**
 * How long each implementation took, in milliseconds.
 */
interface BacklinkMeasurement {
  readonly cachedInMilliseconds: number;
  readonly originalInMilliseconds: number;
}
