# Revert unique-only deduplication feature

If the unique-only addition breaks multi-file, batch, or duplicate detection, restore this snapshot:

```bash
git checkout pre-unique-dedup -- src/components/DeduplicationPanel.tsx src/utils/deduplication.ts src/components/CampaignInput.tsx src/utils/csv.ts src/types.ts src/App.css scripts/verify-dedup-clicks.ts scripts/verify-dedup-cross-files.ts scripts/verify-dedup-sp-product-targets.ts
git commit -m "Revert deduplication to pre-unique-dedup snapshot."
npm run verify:dedup
npx tsx scripts/verify-dedup-cross-files.ts
npm run build
```

Tag: **pre-unique-dedup**

## Snapshot scope (deduplication system)

- `src/components/DeduplicationPanel.tsx` — UI, filters, export, single-sheet drain finder
- `src/utils/deduplication.ts` — cross-campaign, cross-batch, within-file, single-sheet engines
- `src/components/CampaignInput.tsx` — campaign build for dedup tab
- `src/utils/csv.ts` — CSV parsing / column detection used by dedup
- `src/types.ts` — `Campaign`, `DuplicateResult`
- `src/App.css` — deduplication panel styles
- `scripts/verify-dedup-clicks.ts`, `verify-dedup-cross-files.ts`, `verify-dedup-sp-product-targets.ts`

## Verified behavior at this snapshot

- Default: terms in **at least 2** campaigns/keywords/batches (minimum control, cannot go below 2).
- **As is / Batch mode** with multiple CSVs: keyword-level `findWithinFileDuplicates` merge (unless manual keywords change mode).
- Combined totals filters (min/max clicks, orders, ACOS, zero sales).
- Export/copy respects table filters.
