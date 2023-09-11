import { CachedMetadata, LinkCache, Plugin, TFile } from 'obsidian';
import { GetBacklinksForFileFunc } from 'types';

export default class BacklinkCachePlugin extends Plugin {
    private _defaultGetBacklinksForFile!: GetBacklinksForFileFunc;
    private _linksMap = new Map<string, Set<string>>();
    private _backlinksMap = new Map<string, Map<string, Set<LinkCache>>>();

    async onload(): Promise<void> {
        const noteFiles = this.app.vault.getMarkdownFiles();
        console.log(`Processing ${noteFiles.length} note files`);
        let i = 0;
        for (const noteFile of noteFiles) {
            i++;
            console.debug(`Processing ${i} / ${noteFiles.length} - ${noteFile.path}`);
            const cache = this.app.metadataCache.getFileCache(noteFile);
            if (cache) {
                this.processBacklinks(cache, noteFile.path);
            }
        }

        this._defaultGetBacklinksForFile = this.app.metadataCache.getBacklinksForFile
        this.app.metadataCache.getBacklinksForFile = this.getBacklinksForFile.bind(this);

        this.registerEvent(this.app.metadataCache.on('changed', (file, _, cache) => {
            console.debug(`Handling cache change for ${file.path}`);
            this.processBacklinks(cache, file.path);
        }));

        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            console.debug(`Handling rename from ${oldPath} to ${file.path}`);
            this.removePathEntries(oldPath);

            if (file instanceof TFile) {
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache) {
                    this.processBacklinks(cache, file.path);
                }
            }
        }));

        this.registerEvent(this.app.vault.on('delete', (file) => {
            console.debug(`Handling deletion ${file.path}`);
            this.removePathEntries(file.path);
        }));
    }

    removePathEntries(path: string) {
        console.debug(`Removing ${path} entries`);
        this._backlinksMap.delete(path);
        const linkedNotePaths = this._linksMap.get(path) || [];

        for (const linkedNotePath of linkedNotePaths) {
            this._backlinksMap.get(linkedNotePath)?.delete(path);
        }

        this._linksMap.delete(path);
    }

    async onunload(): Promise<void> {
        this.app.metadataCache.getBacklinksForFile = this._defaultGetBacklinksForFile;
    }

    getBacklinksForFile(file: TFile) {
        const notePathLinksMap = this._backlinksMap.get(file.path) || new Map<string, Set<LinkCache>>();
        const data = {} as Record<string, LinkCache[]>;

        for (const [notePath, links] of notePathLinksMap.entries()) {
            data[notePath] = [...links].sort((a, b) => a.position.start.offset - b.position.start.offset);
        }

        return {
            data
        };
    }

    extractLinkPath(link: string) {
        return link.replace(/\u00A0/g, ' ').normalize('NFC').split('#')[0];
    }

    processBacklinks(cache: CachedMetadata, notePath: string) {
        console.debug(`Processing backlinks for ${notePath}`);

        if (!this._linksMap.has(notePath)) {
            this._linksMap.set(notePath, new Set<string>());
        }

        const allLinks = [] as LinkCache[];
        if (cache.links) {
            allLinks.push(...cache.links);
        }

        if (cache.embeds) {
            allLinks.push(...cache.embeds);
        }

        for (const link of allLinks) {
            const linkFile = this.app.metadataCache.getFirstLinkpathDest(this.extractLinkPath(link.link), notePath);
            if (!linkFile) {
                continue;
            }

            let notePathLinksMap = this._backlinksMap.get(linkFile.path);

            if (!notePathLinksMap) {
                notePathLinksMap = new Map<string, Set<LinkCache>>();
                this._backlinksMap.set(linkFile.path, notePathLinksMap);
            }

            let linkSet = notePathLinksMap.get(notePath);

            if (!linkSet) {
                linkSet = new Set<LinkCache>();
                notePathLinksMap.set(notePath, linkSet);
            }

            linkSet.add(link);
            this._linksMap.get(notePath)?.add(linkFile.path);
        }
    }
}
