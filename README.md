
# Local Files

folder structure
flsfl (obsidian)
mv/
    m/
        meta/
    v/
        YYMM/
hr
    h/
        meta/
    r/
        YYMM/
lb

# raindrop

# choices
Postgres is used to rebuilt from Markdown and the file system.
sync runs only when requested
each file will has their markdown metadata
each markdown metadata will have scanned_at its frontmatter
moved notes should be detected
meta/ will be filled with metadata as markdown of files inside appointed folder
meta/ names the file with [original_filename].[ext].md
in flsfl, Each note represents one file, like one row in a database. Frontmatter fields are the columns, and the note body holds longer notes. This avoids maintaining one large, fragile table. Stable IDs, consistent field names and types, predictable filenames, and templates can be added where useful.

## What is authoritative?

| Information | Authority | Database role |
| --- | --- | --- |
| Human metadata: `tags`, `description`, and note body | Markdown note | Cached copy; can be rebuilt from notes |
| File facts: path, size, hash, modification time, inode, and MIME type | File system | Indexed copy, refreshed by scanning |
| Overall index | Markdown plus file system | Postgres is a derived, rebuildable index, not the source of truth |

When a note is first created, its frontmatter is prefilled with file facts. Those values are a snapshot, not authoritative data. The importer reads only `tags`, `description`, and the body; it ignores the other frontmatter fields.

## Note creation and editing

- Notes are created only when requested, using a helper command that places the note at the mirrored path and fills in the current file facts.
- Anyone with access can edit any note; there are no per-user permissions.
- The importer checks that `tags` is a list of strings and `description` is one line. Invalid notes are logged and skipped, leaving the last valid database values intact.
- Files named `*.sync-conflict-*` are ignored and reported.
- A `scanned_at` field could show when the file facts in a note were last refreshed; this is still undecided.

## What `meta sync` does

There is no background watcher or periodic scan in the current design. A sync runs on demand, or possibly at startup (still undecided):

1. Import note edits first, so the latest human metadata is captured before any notes are regenerated.
2. Scan `media/` into a temporary listing and compare it with the database's `files` table.
3. Match renames using `(inode, size, mtime)`. If that is ambiguous, compare hashes.
4. Update database paths and move notes when a source file is renamed.
5. Mark a deleted source file as `missing`; keep and report its note rather than deleting it.
6. Leave new files without notes until the helper command is run.
7. Regenerate a note if it was deleted or renamed by hand. A manually moved note is left as an orphan to report, while the expected note is recreated.

If more than about 5% of files appear missing, abort the sync. This helps avoid treating an unavailable or unmounted drive as mass deletion.

## Using the metadata

In Obsidian, Dataview or Bases can present notes as tables. Frontmatter is ordinary YAML between `---` delimiters, so code can parse it with standard YAML libraries without Obsidian. Keep fields meaningful and minimal: `type` is likely the most useful general-purpose field; add fields such as `status` or `summary` when they are useful.

Two possible uses:

- **Media log:** one note per show or book, with fields such as `type`, `status`, `rating`, `started`, `finished`, and `creator`.
- **Vault-wide index:** a Dataview table is generated for display and is not itself a data file. External tools can either run a query through the Obsidian API or consume a generated `_index.md` file.

