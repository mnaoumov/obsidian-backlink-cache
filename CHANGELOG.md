# CHANGELOG

## 3.0.3

This release has 2 documentation changes. 7 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Documentation

- add issue-filing instructions for AI agents
- **readme:** combine related resources and plugin comparisons

## 3.0.2

This release has 1 fix and 1 documentation change. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- the successor notice stays until you uninstall or disable the plugin, and shows the plugin names as code

### Documentation

- merge keeping the repo out of the archive, so installed copies keep receiving updates

## 3.0.1

This release has 2 fixes and 1 documentation change. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- merge tidying the successor-enabled notice and banner
- merge marking the plugin names in the successor suggestion reason as code

### Documentation

- merge marking plugin names as code in docs, demo vault and comments

## 3.0.0

This release has 1 breaking change.

### Breaking changes

- merge reducing the plugin to pointing to its successor

## 2.17.0

This release has 1 new feature, 9 fixes and 6 documentation changes. 20 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- merge suggesting `Advanced Metadata Cache` as the successor

### Fixed

- **backlinks:** merge reading the held metadata cache so a refresh never saves the editor
- **canvas:** merge loading the canvas index Obsidian leaves unloaded
- **backlinks:** merge patching the pane when it opens after load
- **backlinks:** merge installing the pane patch once per session
- **test:** merge the headless demo-vault toolkit install
- **deps:** restore the lockfile's missing resolved and integrity fields
- **test:** restore the performance project's vault wiring and transport budget
- **deps:** float devalue to 5.9.4, clearing GHSA-9rgm-9g3h-6x36
- **build:** wire build:compile to buildCompile and drop the duplicate leaf script

### Documentation

- **demo-vault:** merge documenting the successor suggestion
- replace the private rule-id citations with what they assert
- name the library and the sibling plugins so a reader can resolve them
- replace the private tracker references with what they pointed at
- say where the debug command is run
- name the unversioned demo-vault asset and the folder it unzips into

## 2.16.5

This release has 2 fixes and 1 documentation change. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- **deps:** move to `obsidian-integration-testing` 11 and `obsidian-dev-utils` 96.5.2
- **deps:** drop the brace-expansion file: override that breaks a clean install

### Documentation

- point plugin-directory links at community.obsidian.md

## 2.16.4

This release has 1 fix and 3 documentation changes. 6 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- override deepmerge-ts to clear GHSA-ggr8-5vv4-36mx

### Documentation

- **readme:** render the same in Obsidian's plugin page as on `GitHub`
- add store screenshots and surface them in the README
- **demo-vault:** give the settings note its buttons

## 2.16.3

This release has 1 new feature and 1 documentation change.

### New

- **demo-vault:** migrate to `obsidian-dev-utils` 93.3.1 and adopt the authoring convention

### Documentation

- make the demo vault the documentation, in the standard layout

## 2.16.2

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.16.1

This release has 1 fix. 4 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- re #17

## 2.16.0

This release has 1 documentation change. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Documentation

- fix the demo vault download instructions

## 2.15.0

This release has 1 new feature and 1 documentation change. 4 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- \[FR\] Obsidian is adding native support to backlinks in Canvas files (#13)

### Documentation

- drop stale CLAUDE.md "Known Issues" pointers from perf test comments

## 2.14.5

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.14.4

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **demo-vault:** export invoke() from startup script; add Invocables folder

## 2.14.3

This release has 6 documentation changes. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Documentation

- standardize demo-vault README
- drop per-plugin demo-vault setup notes (bootstrap covered by the `obsidian-dev-utils` harness)
- unnumber demo-vault setup notes
- **demo-vault:** create the `Backlink Cache` demo vault
- update
- migrate to AGENTS.md

## 2.14.2

This release has maintenance changes only. 8 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 2.14.1

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.14.0

This release has 1 improvement.

### Improved

- make faster

## 2.13.0

This release has 1 new feature. 8 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- make bulk folder deletion O(N) by patching updateRelatedLinks

## 2.12.8

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 2.12.7

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.12.6

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 2.12.5

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.12.4

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.12.3

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.12.2

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.12.1

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 2.12.0

This release has 1 new feature. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### New

- add Refresh backlink panels command re #14

## 2.11.21

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.11.20

This release has 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- properly disable extra notices re #11

## 2.11.19

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.11.18

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.11.17

This release has maintenance changes only. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 2.11.16

This release has 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- build

## 2.11.15

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.11.14

- Minor changes

## 2.11.13

- Minor changes

## 2.11.12

- Minor changes

## 2.11.11

- Minor changes

## 2.11.10

- Minor changes

## 2.11.9

- Minor changes

## 2.11.8

- Minor changes

## 2.11.7

- Minor changes

## 2.11.6

- Fix performance (#10)

## 2.11.5

- Minor changes

## 2.11.4

- Minor changes

## 2.11.3

- Minor changes

## 2.11.2

- Minor changes

## 2.11.1

- Minor changes

## 2.11.0

This release has 1 other change.

### Other changes

- Improve precision for multi links in frontmatter

## 2.10.0

This release has 1 other change.

### Other changes

- Add setting shouldShowProgressBarOnLoad (#8)

## 2.9.0

- Support links to non-existing files
  - fix: <https://github.com/mnaoumov/obsidian-better-markdown-links/issues/18>

## 2.8.3

- Minor changes

## 2.8.2

- Minor changes

## 2.8.1

- Minor changes

## 2.8.0

This release has 1 other change.

### Other changes

- handleFileCreate/handleFileModify

## 2.7.6

- Fix counts()

## 2.7.5

This release has 2 other changes.

### Other changes

- Improve performance
- Prevent double init

## 2.7.4

- Minor changes

## 2.7.3

- Minor changes

## 2.7.2

- Minor changes

## 2.7.1

This release has 1 other change.

### Other changes

- New template

## 2.7.0

This release has 1 other change.

### Other changes

- Switch to progress bar

## 2.6.0

This release has 2 other changes.

### Other changes

- Install typescript
- Ensure all pending operations terminated

## 2.5.0

This release has 3 other changes.

### Other changes

- Use strongly typed canvas references
- Use CanvasReference
- Use canvas.d.ts

## 2.4.0

This release has 10 other changes.

### Other changes

- Parse metadata frontmatter links
- Add auto-refresh
- Check filters
- Init count once
- Show canvas backlink context
- Remove EphemeralState
- Show multiple results to the same file
- Add canvas backlink context
- Use getBacklinksFromFile for recomputeBacklink
- Add links from canvas text

## 2.3.0

This release has 1 other change.

### Other changes

- Pass proper CanvasEphemeralState to highlight the node

## 2.2.15

- Minor changes

## 2.2.14

- Minor changes

## 2.2.13

This release has 2 other changes.

### Other changes

- Lint
- Update task name

## 2.2.12

This release has 1 other change.

### Other changes

- format

## 2.2.11

- Minor changes

## 2.2.10

- Minor changes

## 2.2.9

- Minor changes

## 2.2.8

- Minor changes

## 2.2.7

- Minor changes

## 2.2.6

This release has 1 other change.

### Other changes

- Remove non-standard setImmediate

## 2.2.5

- Minor changes

## 2.2.4

This release has 1 other change.

### Other changes

- Refactor

## 2.2.3

- Improve performance

## 2.2.2

This release has 1 other change.

### Other changes

- Refactor abortSignal

## 2.2.1

- Minor changes

## 2.2.0

This release has 1 other change.

### Other changes

- Refactor loop

## 2.1.2

This release has 1 other change.

### Other changes

- Read JSON without console.log errors

## 2.1.1

This release has 1 other change.

### Other changes

- Better check for incomplete canvas

## 2.1.0

This release has 2 other changes.

### Other changes

- Show canvas backlinks only if Canvas plugin enabled
- Don't fail on invalid canvas

## 2.0.0

- Enable backlinks for canvas files

## 1.11.5

This release has 1 other change.

### Other changes

- Rename next

## 1.11.4

- Minor changes

## 1.11.3

- Minor changes

## 1.11.2

- Refactor

## 1.11.1

- Minor changes

## 1.11.0

- Minor changes

## 1.10.0

This release has 1 other change.

### Other changes

- Allow passing path or file

## 1.9.0

This release has 2 other changes.

### Other changes

- Invoke processPendingActions sync
- Refactor to monkey-around

## 1.8.1

This release has 1 other change.

### Other changes

- Fix init order

## 1.8.0

This release has 1 other change.

### Other changes

- Stop initializing if unloaded

## 1.7.0

This release has 1 other change.

### Other changes

- Fix race conditions

## 1.6.0

This release has 1 other change.

### Other changes

- Skip file if the cache could not be loaded

## 1.5.6

- Refactor

## 1.5.5

- Refactor

## 1.5.4

This release has 1 other change.

### Other changes

- Avoid repetitive actions to improve performance

## 1.5.3

This release has 1 other change.

### Other changes

- Switch debounce timeout to one minute

## 1.5.2

- Refactor

## 1.5.1

This release has 1 other change.

### Other changes

- Refactor

## 1.5.0

This release has 1 other change.

### Other changes

- Add support for missing file argument

## 1.4.0

This release has 1 other change.

### Other changes

- Keep original func

## 1.3.0

This release has 2 other changes.

### Other changes

- Process in alphabetic order
- Debounce bulk operations

## 1.2.0

This release has 1 other change.

### Other changes

- Update cache only when layout is ready

## 1.1.0

- Fixed inaccurate cache updates on edit

## 1.0.0

- Initial implementation
