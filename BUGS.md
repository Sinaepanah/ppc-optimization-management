# Bug list — notes & corrections

## Corrections (not bugs)

### Perf column vs. Orders click-highlight

**Earlier concern:** Input orders lower than Reference orders, but Perf shows “Better In Broad” (or source), which looked inconsistent with highlighting which side “wins” on orders.

**Correction:** This is **expected behavior**, not a defect.

- **Perf** uses a **multi-parameter** rule (`getPerformanceLabel` in `src/autoExact/utils/performanceComparison.ts`): it compares **orders**, **ACoS**, and **CVR** in three separate checks and picks **Better in {match type}** / **Better in Exact** / **Similar** from **which side wins more of those three** (unweighted).
- **Orders column click** (Promote table compare UI) highlights **only** who has the **higher order count** for that metric; it does **not** drive the Perf label.

So Perf and the Orders highlight can disagree: e.g. Reference can win on **orders** while **Broad** still wins **overall Perf** if Broad wins on **ACoS** and/or **CVR**.

**Perf logic is intentionally unchanged** unless product asks for a different design.

---

## Open issues

*(None tracked here yet — add real bugs below.)*
