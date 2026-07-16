# Codex Handoff

This repo was updated after testing large Shopify crawls, especially Nobero.

## What Changed

- Added `--no-probe` to skip Shopify collection pagination probing in `discover` mode.
- Added automatic crawl checkpoints so interrupted/OOM crawls still leave partial data.
- Added `--checkpoint-interval <pages>` to control how often checkpoints are written.
- Added `--no-checkpoint` to disable checkpoints.
- Exported `flattenPage` from `src/pipeline/outputWriter.ts` so checkpoints can reuse the same page CSV shape as final reports.
- Updated `README.md` with the new flags and checkpoint file paths.

## Checkpoint Files

During long crawls, partial data is written to:

```text
data/checkpoints/latest/progress.json
data/checkpoints/latest/pages.json
data/checkpoints/latest/pages.csv
data/checkpoints/latest/issues.json
data/checkpoints/latest/issues.csv
```

These are separate from final reports in `data/reports`.

## Recommended Nobero Command

Use this on a 64 GB RAM machine:

```bash
node --max-old-space-size=32768 --import tsx src/index.ts --url https://nobero.com --mode discover --max-pages 3000 --max-depth 8 --memory-safe --no-excel --no-probe --checkpoint-interval 25
```

Why:

- `--max-old-space-size=32768` gives Node a 32 GB heap.
- `--memory-safe` reduces stored raw links/images/text.
- `--no-excel` avoids heavy workbook generation.
- `--no-probe` avoids the slow/memory-heavy per-collection probe pass.
- `--checkpoint-interval 25` saves partial data every 25 crawled pages.

## Validation

Last validation run:

```text
npm.cmd run typecheck
npm.cmd test
```

Result:

```text
typecheck passed
48 tests passed
0 failed
```

## Notes

- The previous Nobero crawl crashed with `JavaScript heap out of memory` while probing collections.
- The old code wrote final reports only after the crawl completed, so that crashed run did not leave recoverable Nobero reports.
- With the checkpoint update, future crashes should still leave the last saved partial `pages.csv` and `issues.csv`.
- Current successful saved report data in `data/reports` is still from TriprIndia unless a newer crawl completes.
