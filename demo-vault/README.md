# Backlink Cache demo vault

A small Obsidian vault that demonstrates the [Backlink Cache](https://github.com/mnaoumov/obsidian-backlink-cache) plugin - it keeps a live index of the vault's backlinks so `app.metadataCache.getBacklinksForFile()` (and the core **Backlinks** pane) stay fast even in large vaults.

Open [00 Start](<./00 Start.md>), then open [01 Backlink cache](<./01 Backlink cache.md>) and click its **Run** button: it asks the cache for the backlinks of `Central topic` and lists the notes that link to it.

Note that in a vault this small the cached lookup is not visibly faster than Obsidian's built-in one - the speed-up shows in large vaults. The demo is here to show *what* the plugin exposes: a cached, extended backlinks API.

## First open

The first time you open this vault, Obsidian treats it as **untrusted**, so the bundled plugins are listed but not loaded until you **Trust author and enable plugins** and reload. After that, the Demo Vault Helper installs [CodeScript Toolkit](https://github.com/mnaoumov/obsidian-codescript-toolkit) (which powers the **Run** buttons) and opens the start note for you.
