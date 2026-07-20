Welcome to the [Backlink Cache](https://github.com/mnaoumov/obsidian-backlink-cache/) demo vault. **Backlink Cache** keeps an always-up-to-date index of every note's backlinks, so `app.metadataCache.getBacklinksForFile()` - the undocumented function that powers Obsidian's core **Backlinks** pane and many community plugins - answers from the index instead of rescanning the whole vault on every call.

**Honest note:** in a tiny vault like this one you will *not* feel a speed difference - the built-in lookup is already fast enough here. The plugin earns its keep in **large** vaults (thousands of notes and links), where the built-in scan gets slow. What this vault shows is *what* the plugin does: it serves the same backlinks through a cached, extended API you can call yourself.

**How to see it:** open [[01 Backlink cache]] and click its **Run** button - it asks the cache for the backlinks of [[Central topic]] and lists the notes that link to it.

> [!TIP] Interactive buttons
>
> The two setup notes have **Run** buttons, powered by [`CodeScript Toolkit`](https://github.com/mnaoumov/obsidian-codescript-toolkit/), which this vault installs for you automatically on first open (see [[CodeScript Toolkit prerequisite]]). The feature notes use the same buttons to call Backlink Cache's API.

## Feature

- [[01 Backlink cache]]
- [[02 Fast, safe, and original backlinks]]
- [[03 Settings]]

## Setup

- [[Code buttons check]]
- [[CodeScript Toolkit prerequisite]]
