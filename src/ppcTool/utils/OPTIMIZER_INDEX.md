# PPC Optimizer – Parameter Index & Algorithm Reference

## Data Sources

### Layer 1: Ad-Level PPC Data Extractor
| Parameter | Source | Used In | Purpose |
|-----------|--------|---------|---------|
| Bid | Form/OCR | Base bid calc | Current keyword bid; anchor for suggestions |
| Impressions | Form/OCR | Visibility check | Low visibility detection |
| Clicks | Form/OCR | RPC, CVR, CPC | Revenue per click, conversion rate |
| Total Cost | Form/OCR | ACoS, ROAS | Profitability metrics |
| CPC | Form/OCR | Fallback | When Total Cost missing |
| Purchases | Form/OCR | CVR | Conversion rate = Purchases / Clicks |
| Sales | Form/OCR | ACoS, ROAS, RPC | Revenue attribution |
| ACOS | Form/OCR | Status | Current ACoS (or derived) |

### Layer 2: Placement-Level PPC Data Extractor
| Parameter | Source | Used In | Purpose |
|-----------|--------|---------|---------|
| Bid Adjustment | Form/OCR | Placement calc | Current placement multiplier |
| Impressions | Form/OCR | Data validity | Placement traffic level |
| Clicks | Form/OCR | Data validity | Placement engagement |
| CTR | Form/OCR | (Future) | Placement efficiency |
| Total Cost | Form/OCR | Placement ACoS/ROAS | Placement profitability |
| CPC | Form/OCR | Fallback | When Total Cost missing |
| Purchases | Form/OCR | Placement CVR | Placement conversion |
| Sales | Form/OCR | Placement ACoS/ROAS | Placement revenue |
| ACOS | Form/OCR | Placement decision | Placement profitability |

### User Input
| Parameter | Source | Purpose |
|-----------|--------|---------|
| Target ACoS (%) | OptimizationPanel | Profitability target |

---

## Industry Formulas (Amazon Ads & Partners)

### 1. Target ACoS Bid Adjustment (Bidbear, AdLabs)
```
New Bid = (Target ACoS / Current ACoS) × Current Bid
```
- Above target ACoS → lower bid
- Below target ACoS → raise bid (toward economic max)

### 2. Economic Max CPC (Break-even CPC)
```
Economic Max CPC = Revenue per Click × Target ACoS
Revenue per Click = Sales / Clicks
```

### 3. Break-even ROAS (Amazon Ads)
```
Break-even ROAS = 1 / Gross Profit Margin
Target ROAS = 100 / Target ACoS  (when target ACoS = profit margin)
```

### 4. Placement Optimization (Amazon, Perpetua, AdBadger)
- Bid higher on placements with better ROAS/ACoS
- Bid lower on underperforming placements
- Set base bid per Rest of Search; use modifiers for Top of Search & Product Pages

### 5. Conservative Caps
- Avoid aggressive changes that kill impression share
- Typical: ±20–25% per optimization cycle

---

## Algorithm Flow

1. **Parse** ad-level and placement data
2. **Compute** RPC, economic max CPC, ROAS, CVR, current ACoS
3. **Layer 1**: Apply Target ACoS formula with caps → suggested base bid
4. **Layer 2**: Per placement, compare ACoS/ROAS to target → suggest adjustment
5. **Output** suggested base bid + placement adjustments with rationale
