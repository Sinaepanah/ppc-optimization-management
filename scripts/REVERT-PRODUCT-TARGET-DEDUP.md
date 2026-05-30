# Revert product-target dedup support

If the product-targeting change breaks keyword CSV deduplication, restore the exact prior system:

```bash
git checkout pre-product-target-dedup -- src/utils/csv.ts src/types.ts src/utils/deduplication.ts src/utils/storage.ts src/components/DeduplicationPanel.tsx scripts/verify-dedup-clicks.ts test-fixtures/product-targets-within-file.csv
git commit -m "Revert product-target dedup support to pre-product-target-dedup."
npm run verify:dedup
npm run build
```

Tag created before this feature: **pre-product-target-dedup** (commit `e32c725`).
