# Changelog

## 0.1.3

- Lower the minimum VS Code version to 1.130.0 and use its official stable API definitions. Test the minimum version and current stable version in Linux CI.
- Pin HEAD reads to the same immutable commit used by the cache, so Git API refresh delays cannot store a newer baseline under an older commit.
- Limit Git reads to four concurrent subprocesses and 128 queued commands. Share parsed blobs across notebooks.
- Check notebook size and baseline errors before copying current source, and yield between source batches.
- Keep split-view change details beside the hovered source. The gutter action now explains the split-view limitation instead of choosing an editor group.
- Isolate UI test ports, verify the target workspace, and record source file hashes with installed-package checks.

## 0.1.2

- Show original, current, and deleted source inside the cell through VS Code's native hover. Use the gutter's Show Change context action or hover over a changed source line.
- Use complete small deletion triangles near line boundaries, including empty cells and the end of a cell. Keep blue and green bars at full line height, with deletion triangles beside them when they share a gutter row.
- Add a native QuickDiffProvider comparison probe. Document the tested Notebook limitation and the lack of a public gutter left-click callback.
- Require complete similarity comparisons before accepting or remembering cell matches. Correct non-BMP character scoring and match small edited regions between stable anchors.
- Hide stale line marks while edited cells are pending analysis. Use cell URIs and document versions for both gutter marks and cell summaries.
- Refresh raw/code cell semantics on language changes and avoid repeated decoration submissions for unchanged visible editors.
- Handle intent-to-add entries and directory aliases. Retry transient baseline failures and reuse parsed blobs by object ID.
- Analyze long pure additions and deletions within the documented size limits. Avoid hashing cells already matched by reliable identity.
- Add pending-state host regressions, Git edge cases, Linux CI and VSIX checksum records.

## 0.1.1

- Rename the extension to Jupyter Notebook Git Marks, add bilingual documentation, screenshots, and a Marketplace icon.
- Adopt the source-available license while preserving historical MIT grants.
- Enforce the Marketplace icon size limit before packaging.
