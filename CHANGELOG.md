# Changelog

## 0.1.7

- Packaging-only version update; source matching and gutter behavior are unchanged from 0.1.6.

## 0.1.6

- Mark replacement blocks across their full current range, matching VS Code's Git gutter instead of pairing replacement lines by position. Preserve final-newline changes and deletion anchors.
- Match lightly edited multiline cells by preserved source lines, including when a notebook was edited before opening. Keep ambiguous duplicate cells unmarked.
- Navigate to the previous or next confirmed changed cell in the current notebook, using the selected HEAD or index baseline.
- Wrap navigation at either end and explain when analysis is pending or no confirmed changed cells are available.

## 0.1.5

- Use the confirmed original path for renamed HEAD baselines; report an unavailable rename source instead of selecting unrelated content.
- Ignore rename hints from an older Git API commit after HEAD advances, including when the old path has been reused.
- Read index object IDs, conflict stages, and intent-to-add flags together, reducing repeated Git queries while retaining cached blobs.
- Verify installed runtime, media, and diff code against the current build. Reject stale packages and source changes during installation tests, and clear previous success records before a new run.
- Build one VSIX in CI and test that same package across VS Code versions. Include SHA-256 checksums with local packages and verify them during installation tests.

## 0.1.4

- Keep the gutter action brief: Show Change opens the source preview inside the cell.
- Use VS Code diff theme colors for red original rows, green current rows, and changed-word backgrounds in native cell hovers. Escape source as text and preserve emoji and combining characters.
- Focus long-line previews on each changed word and its nearby context, collapsing unchanged passages. Require CJK and emoji fonts for Linux UI screenshots and verify the emoji font actually used.
- Reserve preview space for both original and current source when a replacement exceeds the display limit.
- Use native status icons for pending and incomplete comparisons, and explain analysis limits and ambiguous cells in the status tooltip.
- Add Marketplace installation links, troubleshooting, and related Notebook tools to the English and Chinese documentation.
- Group source and test tooling by responsibility, generate gutter icons from a shared definition, and write local VSIX builds to `output/packages/`.

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
