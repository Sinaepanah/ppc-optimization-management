# Amazon PPC Analysis

A **local-only** web app for Amazon PPC managers to analyze Customer Search Term data: **keyword deduplication** across campaigns and **relevancy filtering** for negation based on topic intent.

- Built with **Vite**, **React**, and **TypeScript**.
- **Optional backend**: A simple Node/Express server can store campaigns and topic profiles in JSON files (local or hosted). If the backend is not running, the app uses `localStorage` as before.

---

## Install

From the project folder:

```bash
npm install
```

---

## Run locally (Windows)

**Frontend only** (data in `localStorage`):

```bash
npm run dev
```

Then open the URL shown in the terminal (e.g. `http://localhost:5173`) in your browser.

**Frontend + backend** (data stored in `server/data/` as JSON files):

1. In one terminal: `npm run server` (backend on http://localhost:3001).
2. In another terminal: `npm run dev` (frontend on http://localhost:5173).
3. Open http://localhost:5173. The app will use the backend when it’s available and fall back to `localStorage` if not.

To build for production:

```bash
npm run build
npm run preview
```

---

## How to use

### Campaign Input

1. Open the **Campaign Input** tab.
2. Enter a **Campaign name** (e.g. “Brand Campaign - Exact”).
3. Add terms using either:
   - **Paste**: paste one search term per line, then click **Add campaign from paste**.
   - **CSV upload**: choose a CSV file. The app will suggest a column (e.g. “Customer Search Term”). Pick the column that contains search terms and click **Use this column**.
4. Terms are normalized and deduplicated **within** each campaign. Your campaigns appear in the list with their unique term count.
5. Remove a campaign with **Remove** if needed.

---

### Deduplication (cross-campaign duplicates)

1. Open the **Deduplication** tab.
2. Select **2 or more** campaigns (checkboxes). Use **Select all** / **Deselect all** if needed.
3. Set **Show terms in at least N campaigns** (default 2).
4. The table shows terms that appear in at least N campaigns, with:
   - Normalized term  
   - Campaigns where it appears  
   - Count of campaigns  
   - Example original term per campaign  
5. **Export**
   - Choose format: **Plain**, **Exact [term]**, or **Negative phrase "term"**.
   - **Copy to clipboard** or **Export CSV** for use in Exact campaigns or as Negative keywords.

---

### Relevancy filter (single-campaign, topic-based)

1. Open the **Relevancy Filter** tab.
2. **Topic profiles** (top of tab):
   - Use **Load Drinking Water Test Strip Preset** to create a ready-made profile, or **Create profile** and define your own.
   - Select the **Active profile**.
   - Set **Minimum allowed topic matches** (default 1).
   - Under **Allowed topics** and **Excluded topics**, add topics with **Include phrases** (one per line). Optionally add **Exclude phrases** per topic. Matching uses **word boundaries** (e.g. “pool” matches “pool water test” but not “spool”).
3. **Relevancy filter** (below):
   - Choose the **Campaign** to analyze.
   - The table shows each search term with:
     - Original term, normalized term, **Status** (Flagged / Kept), matched allowed topics, matched excluded topics, **Reason**.
   - Use **Show flagged only** (default on), **Search**, and **Sort** (Status or A–Z) to focus on terms to negate.
4. **Export flagged**
   - Exports **original** term text (not normalized).
   - Format: **Negative phrase "term"** or **Negative exact [term]**.
   - **Copy to clipboard** or **Export CSV** for Negative keyword lists.

---

### Auto → Exact

The **Auto → Exact** tab is a promotion engine: it takes Search Term data (e.g. from Auto or Broad campaigns) and outputs (1) a prioritized list of terms to promote into Exact keywords, and (2) a Negative Exact list to add back into the source campaign to avoid cannibalization.

**How to use**

1. Open the **Auto → Exact** tab.
2. **Source Campaign**: Enter a label for export naming (e.g. “Auto Campaign - Discovery”) if your CSV has no Campaign Name column.
3. **Input data**:
   - **CSV upload**: Upload an Amazon Search Term report. The app will suggest column mappings; map **Search Term**, **Spend**, **Sales**, and **Orders** (required). Optionally map Clicks, Impressions, Campaign Name, Ad Group Name, Match Type, Targeting.
   - **Paste**: Paste tab-delimited rows (e.g. from Excel). If you paste only one column (search terms), metrics are not available and promotion scoring is disabled — use CSV for full analysis.
4. **Column mapping**: Confirm or change which column is Search Term, Spend, Sales, Orders, etc. Fix any “Map these required columns” error before analyzing.
5. **Promotion criteria**: Set thresholds (defaults: Min Orders 2, Min Sales 50, Max ACoS 35%). Optionally enable Minimum Clicks and/or Minimum CVR. Use **Exclude branded terms** (list brand tokens, one per line) and **Exclude irrelevant topics** (Relevancy profile or a simple exclude phrase list).
6. Click **Analyze**.
7. **Results**:
   - **Promote to Exact**: Terms meeting all criteria, ranked by Confidence then Sales. Export as newline list or CSV (keyword, match_type=exact). Option to wrap keywords in brackets [term].
   - **Negative Exact to source**: Same terms as Negative Exact for the source campaign. Copy or export CSV (negative_keyword, match_type=negative exact, source_campaign, reason).
   - **Review queue**: Borderline terms (e.g. ACoS within +10% of max, or orders = min−1 with decent sales) for manual decision.

**Expected CSV columns (Amazon-style names)**

- **Required**: Customer Search Term (or “Search term”, “Search Term”), Spend, Sales (or “Attributed Sales”, “14 Day Total Sales”, “7 Day Total Sales”), Orders (or “Total Orders”, “14 Day Total Orders”, “7 Day Total Orders”).
- **Optional**: Clicks, Impressions, Campaign Name, Ad Group Name, Match Type, Targeting.

**Thresholds and outputs**

- Terms are aggregated by normalized search term (same logic as the rest of the app); metrics are summed. Exports use **original** term text (first seen).
- **Confidence** is a simple score: +2 for orders ≥ min, +2 for sales ≥ min, +2 for ACoS ≤ max, +1 for min Clicks (if enabled), +1 for min CVR (if enabled). Table is sorted by Confidence (desc) then Sales (desc).
- **Review queue**: Terms that nearly qualify (ACoS within +10 percentage points of max, or orders = minOrders − 1 with sales ≥ half of min sales).

---

## Presets

- **Load Drinking Water Test Strip Preset**  
  Creates a topic profile aimed at drinking water test strips:

  - **Allowed topics**: Drinking water (e.g. drinking water, tap water, well water), Home contaminants (lead, chlorine, nitrate, etc.), Home testing intent (water test kit, test strips for water).
  - **Excluded topics**: Aquarium (aquarium, fish tank, reef tank, koi pond, etc.), Pool & spa (pool, hot tub, spa, jacuzzi), Hydroponics (hydroponic, nutrient solution, grow tent).

  Use this as a starting point; you can duplicate or edit the profile after loading.

---

## Data and performance

- **Storage**: When the backend is running, campaigns and topic profiles are stored in `server/data/` (JSON files) and stay across browsers. Otherwise they are saved in the browser’s `localStorage`. Clearing site data removes only `localStorage` data.
- **Performance**: The app uses `Map`/`Set` and avoids O(n²) comparisons. For very large inputs (e.g. 50,000+ terms) a warning may appear; processing continues.

---

## Tech stack

- Vite, React 18, TypeScript  
- Optional backend: Node, Express; JSON file storage in `server/data/` (port 3001). For hosted deployment, set `VITE_API_URL` to your API base URL when building the frontend.  
- Plain CSS (no framework)
