import type { TFile } from 'obsidian';

import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it
} from 'vitest';

import { getFileComparer } from './file-comparer.ts';

function createMockFile(basename: string, ctime: number, mtime: number): TFile {
  return strictProxy<TFile>({
    basename,
    stat: {
      ctime,
      mtime,
      size: 0
    }
  });
}

describe('getFileComparer', () => {
  const fileA = createMockFile('alpha', 100, 200);
  const fileB = createMockFile('beta', 200, 100);
  const fileC = createMockFile('alpha', 300, 300);

  describe('alphabetical (default)', () => {
    it('should sort alphabetically by basename', () => {
      const comparer = getFileComparer('alphabetical');
      expect(comparer(fileA, fileB)).toBeLessThan(0);
      expect(comparer(fileB, fileA)).toBeGreaterThan(0);
    });

    it('should return 0 for equal basenames', () => {
      const comparer = getFileComparer('alphabetical');
      expect(comparer(fileA, fileC)).toBe(0);
    });

    it('should use alphabetical for unknown sort orders', () => {
      const comparer = getFileComparer('unknownSortOrder');
      expect(comparer(fileA, fileB)).toBeLessThan(0);
    });
  });

  describe('alphabeticalReverse', () => {
    it('should sort reverse alphabetically by basename', () => {
      const comparer = getFileComparer('alphabeticalReverse');
      expect(comparer(fileA, fileB)).toBeGreaterThan(0);
      expect(comparer(fileB, fileA)).toBeLessThan(0);
    });
  });

  describe('byCreatedTime', () => {
    it('should sort by created time (newest first)', () => {
      const comparer = getFileComparer('byCreatedTime');
      expect(comparer(fileA, fileB)).toBeGreaterThan(0);
      expect(comparer(fileB, fileA)).toBeLessThan(0);
    });
  });

  describe('byCreatedTimeReverse', () => {
    it('should sort by created time (oldest first)', () => {
      const comparer = getFileComparer('byCreatedTimeReverse');
      expect(comparer(fileA, fileB)).toBeLessThan(0);
      expect(comparer(fileB, fileA)).toBeGreaterThan(0);
    });
  });

  describe('byModifiedTime', () => {
    it('should sort by modified time (newest first)', () => {
      const comparer = getFileComparer('byModifiedTime');
      expect(comparer(fileA, fileB)).toBeLessThan(0);
      expect(comparer(fileB, fileA)).toBeGreaterThan(0);
    });
  });

  describe('byModifiedTimeReverse', () => {
    it('should sort by modified time (oldest first)', () => {
      const comparer = getFileComparer('byModifiedTimeReverse');
      expect(comparer(fileA, fileB)).toBeGreaterThan(0);
      expect(comparer(fileB, fileA)).toBeLessThan(0);
    });
  });
});
