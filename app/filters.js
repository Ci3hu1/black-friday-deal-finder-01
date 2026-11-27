// Price Ledger — filtering, sorting and the ledger's own arithmetic.
// Every number the board prints (counts, totals, verdict shares) is computed
// here from data.js, never typed in by hand, so the board cannot disagree
// with its own data.

export const VERDICTS = ["NEW LOW", "STRONG", "ROUTINE"];

export function discountPct(d) {
  return Math.round((1 - d.price / d.was) * 100);
}

export function savings(d) {
  return Math.round((d.was - d.price) * 100) / 100;
}

// The ledger's totals, computed from the deals. The board prints these and
// the checksum line re-states them, so a miscount would show on the page.
export function ledgerStats(list) {
  const total = list.length;
  const totalSavings = list.reduce((s, d) => s + savings(d), 0);
  const verdicts = {};
  for (const v of VERDICTS) verdicts[v] = 0;
  for (const d of list) verdicts[d.verdict] = (verdicts[d.verdict] ?? 0) + 1;
  const stores = [...new Set(list.map((d) => d.store))].sort();
  const categories = [...new Set(list.map((d) => d.category))].sort();
  const cheapest = [...list].sort((a, b) => a.price - b.price)[0];
  const biggestCut = [...list].sort((a, b) => discountPct(b) - discountPct(a))[0];
  return { total, totalSavings, verdicts, stores, categories, cheapest, biggestCut };
}

export function applyFilters(list, f) {
  const q = (f.q ?? "").trim().toLowerCase();
  let out = list.filter((d) => {
    if (q && !`${d.title} ${d.store} ${d.category}`.toLowerCase().includes(q)) return false;
    if (f.category && f.category !== "All" && d.category !== f.category) return false;
    if (f.store && f.store !== "All" && d.store !== f.store) return false;
    if (f.verdict && f.verdict !== "All" && d.verdict !== f.verdict) return false;
    if (f.minDiscount && discountPct(d) < Number(f.minDiscount)) return false;
    return true;
  });
  const sort = f.sort ?? "saving";
  const by = {
    saving: (a, b) => savings(b) - savings(a),
    pct: (a, b) => discountPct(b) - discountPct(a),
    price: (a, b) => a.price - b.price,
    title: (a, b) => a.title.localeCompare(b.title),
  }[sort] ?? ((a, b) => savings(b) - savings(a));
  return [...out].sort(by);
}

// Read the board's starting filters from the hash, so a link (or a
// screenshot) can open the board already filtered, e.g. #/?discount=50.
export function filtersFromHash(hash) {
  const query = hash.startsWith("#/?") ? hash.slice(3) : "";
  const p = new URLSearchParams(query);
  return {
    q: p.get("q") ?? "",
    category: p.get("category") ?? "All",
    store: p.get("store") ?? "All",
    verdict: p.get("verdict") ?? "All",
    minDiscount: p.get("discount") ?? "",
    sort: p.get("sort") ?? "saving",
  };
}

export function filtersToHash(f) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.category !== "All") p.set("category", f.category);
  if (f.store !== "All") p.set("store", f.store);
  if (f.verdict !== "All") p.set("verdict", f.verdict);
  if (f.minDiscount) p.set("discount", f.minDiscount);
  if (f.sort !== "saving") p.set("sort", f.sort);
  const s = p.toString();
  return s ? `#/?${s}` : "#/";
}
