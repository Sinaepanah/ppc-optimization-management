# Revert to working merged keyword deduplication (May 31, 2026)

If future dedup changes break multi-file or single-file behavior, restore this exact snapshot:

```bash
git checkout dedup-working-merged-keywords -- src/components/DeduplicationPanel.tsx src/components/CampaignInput.tsx src/utils/csv.ts src/utils/deduplication.ts scripts/verify-dedup-clicks.ts scripts/verify-dedup-cross-files.ts
git commit -m "Revert deduplication to dedup-working-merged-keywords snapshot."
npm run verify:dedup
npx tsx scripts/verify-dedup-cross-files.ts
npm run build
```

Tag: **dedup-working-merged-keywords**

## Verified behavior at this snapshot

- **Single CSV**: keyword-level within-file duplicates (e.g. 8+ terms; kidney term sums clicks across keyword rows).
- **Multiple CSVs selected**: same keyword-level logic merged across all selected uploads (~11 duplicates on May 31 SB samples; urinalysis 4 clicks from both files).
- **As is vs Batch mode**: no difference for CSV-only dedup — both merge selected files the same way. Batch/cross-source logic applies only with **CUSTOM MANUAL KEYWORDS**.
- **Product-target CSVs**: still supported via `deduplication.ts` (`matchTargetKind`, `detectMatchTargetColumn`).

## Key implementation points

- `DeduplicationPanel`: `isWithinFileMode` is always true for CSV uploads (no manual keyword campaign); uses `findWithinFileDuplicates` for all selected campaigns.
- `CampaignInput`: `resolveTermColumnForFile` maps the term column consistently when uploading multiple files with slightly different headers.
- `csv.ts`: `resolveTermColumnForFile`, `normalizeSearchTermReportRows` (Amazon preamble stripping).
