import { LinkCache, TFile } from 'obsidian';

type GetBacklinksForFileFunc = (file: TFile) => {
    data: Record<string, LinkCache[]>
};

declare module 'obsidian' {
    interface MetadataCache {
        getBacklinksForFile: GetBacklinksForFileFunc
    }
}
