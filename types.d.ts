import { LinkCache } from 'obsidian';

type GetBacklinksForFileResult = {
    data: Record<string, LinkCache[]>;
};

declare module 'obsidian' {
    interface MetadataCache {
        getBacklinksForFile: (file: TFile) => GetBacklinksForFileResult;
    }
}
