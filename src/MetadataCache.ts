import type {
  App,
  CachedMetadata,
  MarkdownView,
  ReferenceCache,
  TFile
} from "obsidian";
import { retryWithTimeout } from "./Async.ts";

export async function getCacheSafe(app: App, fileOrPath: TFile | string): Promise<CachedMetadata | null> {
  let cache: CachedMetadata | null = null;

  await retryWithTimeout(async () => {
    const file = typeof fileOrPath === "string" ? app.vault.getFileByPath(fileOrPath) : fileOrPath;

    if (!file) {
      cache = null;
      return true;
    }

    await saveNote(app, file);

    const fileInfo = app.metadataCache.getFileInfo(file.path);
    const stat = await app.vault.adapter.stat(file.path);

    if (!fileInfo) {
      console.debug(`File cache info for ${file.path} is missing`);
      return false;
    } else if (!stat) {
      console.debug(`File stat for ${file.path} is missing`);
      return false;
    } else if (fileInfo.mtime < stat.mtime) {
      console.debug(`File cache info for ${file.path} is from ${new Date(fileInfo.mtime).toString()} which is older than the file modification timestamp ${new Date(stat.mtime).toString()}`);
      return false;
    } else {
      cache = app.metadataCache.getFileCache(file);
      if (!cache) {
        console.debug(`File cache for ${file.path} is missing`);
        return false;
      } else {
        return true;
      }
    }
  }, {
    timeoutInMilliseconds: 60000
  });

  return cache;
}

async function saveNote(app: App, note: TFile): Promise<void> {
  if (note.extension.toLowerCase() !== "md") {
    return;
  }

  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view as MarkdownView;
    if (view.file?.path === note.path) {
      await view.save();
    }
  }
}

export function getAllLinks(cache: CachedMetadata): ReferenceCache[] {
  let links: ReferenceCache[] = [];

  if (cache.links) {
    links.push(...cache.links);
  }

  if (cache.embeds) {
    links.push(...cache.embeds);
  }

  links.sort((a, b) => a.position.start.offset - b.position.start.offset);

  // BUG: https://forum.obsidian.md/t/bug-duplicated-links-in-metadatacache-inside-footnotes/85551
  links = links.filter((link, index) => {
    if (index === 0) {
      return true;
    }
    return link.position.start.offset !== links[index - 1]!.position.start.offset;
  });

  return links;
}
