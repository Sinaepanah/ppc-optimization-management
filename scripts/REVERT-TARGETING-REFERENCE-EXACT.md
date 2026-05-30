# Revert Exact targeting export Reference CSV support

If targeting-export support breaks campaign-title Reference Exact parsing, restore the exact prior system:

```bash
git checkout pre-targeting-reference-exact -- src/autoExact/utils/referenceExact.ts src/autoExact/components/ReferenceExactUploader.tsx src/autoExact/AutoExactPage.tsx scripts/verify-reference-exact.ts test-fixtures/reference-exact-campaign-title.csv test-fixtures/reference-exact-targeting-export.csv
git commit -m "Revert targeting-export Reference Exact CSV support."
npm run verify:dedup
npx tsx scripts/verify-reference-exact.ts
npm run build
```

Tag: **pre-targeting-reference-exact** (commit `7a22de2`).
