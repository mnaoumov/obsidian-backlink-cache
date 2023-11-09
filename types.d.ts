import { LinkCache } from 'obsidian';

export type GetBacklinksForFileResult = CustomArrayDict<LinkCache>;

interface CustomArrayDict<T> {
    data: Record<string, T[]>;

    add: (key: string, value: T) => void;
    remove: (key: string, value: T) => void;
    removeKey: (key: string) => void;
    get: (key: string) => T[] | null;
    keys: () => string[];
    clear: (key: string) => void;
    clearAll: () => void;
    contains: (key: string, value: T) => boolean;
    count: () => number;
}

declare module 'obsidian' {
    interface MetadataCache {
        getBacklinksForFile: ((file: TFile) => GetBacklinksForFileResult) & { originalFunc?: (file: TFile) => GetBacklinksForFileResult };
    }
}
