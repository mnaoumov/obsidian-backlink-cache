import type { TFile } from 'obsidian';

type FileComparer = (a: TFile, b: TFile) => number;

export function getFileComparer(sortOrder: string): FileComparer {
  switch (sortOrder) {
    case 'alphabeticalReverse':
      return alphabeticalReverseCompare;
    case 'byCreatedTime':
      return byCreatedTimeCompare;
    case 'byCreatedTimeReverse':
      return byCreatedTimeReverseCompare;
    case 'byModifiedTime':
      return byModifiedTimeCompare;
    case 'byModifiedTimeReverse':
      return byModifiedTimeReverseCompare;
    case 'alphabetical':
    default:
      return alphabeticalCompare;
  }
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
  usage: 'sort'
});

const i18nCompare = collator.compare.bind(collator);

function alphabeticalCompare(a: TFile, b: TFile): number {
  return i18nCompare(a.basename, b.basename);
}

function alphabeticalReverseCompare(a: TFile, b: TFile): number {
  return -alphabeticalCompare(a, b);
}

function byCreatedTimeCompare(a: TFile, b: TFile): number {
  return b.stat.ctime - a.stat.ctime;
}

function byCreatedTimeReverseCompare(a: TFile, b: TFile): number {
  return -byCreatedTimeCompare(a, b);
}

function byModifiedTimeCompare(a: TFile, b: TFile): number {
  return b.stat.mtime - a.stat.mtime;
}

function byModifiedTimeReverseCompare(a: TFile, b: TFile): number {
  return -byModifiedTimeCompare(a, b);
}
