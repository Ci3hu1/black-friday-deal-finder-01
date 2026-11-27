// Price Ledger — tests. Node 22, standard library only. Run from the repo
// root: `node tests/check-deals.mjs`. Exit 0 only when every check passes.
// The checks that matter most are the honesty ones: every deal's prices add
// up, every verdict follows from its own evidence, every link names a real
// store, and the site loads nothing from the network.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deals, CHECKED_AT, SOURCES } from "../app/data.js";
import { discountPct, savings, ledgerStats, applyFilters } from "../app/filters.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
let checks = 0;
function check(ok, label, detail = "") {
  checks += 1;
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const REQUIRED = ["id", "title", "store", "category", "price", "was", "url", "checked", "source", "verdict", "evidence"];
const STORES = ["Amazon", "Best Buy", "Walmart"];
const VERDICTS = new Set(["NEW LOW", "STRONG", "ROUTINE"]);

// --- Every deal is complete and its numbers add up -----------------------
const ids = new Set();
for (const d of deals) {
  for (const f of REQUIRED) {
    check(d[f] !== undefined && d[f] !== "" && d[f] !== null, `deal ${d.id} has ${f}`);
  }
  check(!ids.has(d.id), `deal id ${d.id} is unique`);
  ids.add(d.id);
  check(typeof d.price === "number" && d.price > 0, `deal ${d.id} price is a positive number`);
  check(typeof d.was === "number" && d.was > d.price, `deal ${d.id} usual price is above the sale price`, `$${d.price} vs $${d.was}`);
  check(d.checked === CHECKED_AT, `deal ${d.id} checked at the ledger's check time`);
  check(Object.values(SOURCES).includes(d.source), `deal ${d.id} source is a named roundup`);
  check(VERDICTS.has(d.verdict), `deal ${d.id} verdict is one of NEW LOW / STRONG / ROUTINE`);
  check(STORES.includes(d.store), `deal ${d.id} store is Amazon, Best Buy or Walmart`);
  const pct = discountPct(d);
  check(pct >= 0 && pct <= 90, `deal ${d.id} discount is sane`, `${pct}%`);
  check(Math.abs(savings(d) - (d.was - d.price)) < 0.01, `deal ${d.id} savings add up`);
  // A NEW LOW must be earned: 50%+ off, or the evidence says record-low /
  // second-time-under-$1,000. A ROUTINE must not hide a 50% cut.
  if (d.verdict === "NEW LOW") {
    check(pct >= 50 || /record|second time/i.test(d.evidence), `deal ${d.id} NEW LOW is earned`, `${pct}% — ${d.evidence}`);
  }
  if (d.verdict === "ROUTINE") {
    check(pct < 50, `deal ${d.id} ROUTINE is not a 50% cut in disguise`, `${pct}%`);
  }
  // The store link must name the store that sells it.
  const host = new URL(d.url).hostname;
  const expected = d.store === "Amazon" ? "amazon.com" : d.store === "Best Buy" ? "bestbuy.com" : "walmart.com";
  check(host.endsWith(expected), `deal ${d.id} link goes to its store`, d.url);
  // Cross-store prices: either this row is the cheapest (every `also`
  // price is higher), or the evidence says plainly that another store is
  // cheaper — never a silent contradiction.
  for (const alt of d.also ?? []) {
    check(alt.price > 0 && alt.price !== d.price, `deal ${d.id} cross-store price at ${alt.store} is a real different price`, `$${alt.price}`);
    if (alt.price < d.price) {
      check(d.evidence.includes(alt.store) && d.evidence.includes(String(alt.price).replace(".99", "")) || d.evidence.includes(alt.store), `deal ${d.id} evidence names the cheaper store`, d.evidence);
    }
  }
}

// --- The ledger's own arithmetic ------------------------------------------
const stats = ledgerStats(deals);
check(stats.total === deals.length, "ledger total equals deal count");
check(
  stats.verdicts["NEW LOW"] + stats.verdicts["STRONG"] + stats.verdicts["ROUTINE"] === stats.total,
  "verdict counts sum to the deal total",
  JSON.stringify(stats.verdicts),
);
check(stats.total >= 24, "ledger holds at least 24 deals", `${stats.total}`);
check(stats.stores.length >= 3, "ledger covers at least 3 stores", stats.stores.join(", "));
check(stats.categories.length >= 8, "ledger covers at least 8 categories", `${stats.categories.length}`);
check(stats.totalSavings > 0, "total savings is positive", `$${stats.totalSavings}`);
check(stats.verdicts["NEW LOW"] >= 5, "at least 5 NEW LOW verdicts", `${stats.verdicts["NEW LOW"]}`);
check(stats.verdicts["ROUTINE"] >= 3, "at least 3 ROUTINE verdicts (the ledger discriminates)", `${stats.verdicts["ROUTINE"]}`);

// Cross-store pairs agree: the MacBook's Best Buy row and Amazon row must
// name each other's price, and likewise for the AirPods Pro 3 rows.
const mba = deals.find((d) => d.id === "macbook-air-m5-13");
const mbb = deals.find((d) => d.id === "macbook-air-m5-bestbuy");
check(mbb.also?.[0]?.price === mba.price, "MacBook Best Buy row cites the Amazon price", `${mbb.also?.[0]?.price} vs ${mba.price}`);
check(mba.also?.[0]?.price === mbb.price, "MacBook Amazon row cites the Best Buy price", `${mba.also?.[0]?.price} vs ${mbb.price}`);
const app3a = deals.find((d) => d.id === "airpods-pro-3");
const app3w = deals.find((d) => d.id === "airpods-pro-3-walmart");
check(app3w.also?.[0]?.price === app3a.price, "AirPods Walmart row cites the Amazon price");

// --- Filters work ----------------------------------------------------------
check(applyFilters(deals, { category: "TVs" }).every((d) => d.category === "TVs"), "category filter keeps only TVs");
check(applyFilters(deals, { category: "TVs" }).length >= 4, "at least 4 TV deals", `${applyFilters(deals, { category: "TVs" }).length}`);
check(applyFilters(deals, { store: "Best Buy" }).length >= 5, "at least 5 Best Buy deals");
check(applyFilters(deals, { minDiscount: "50" }).every((d) => discountPct(d) >= 50), "50% filter keeps only 50%+ deals");
check(applyFilters(deals, { minDiscount: "50" }).length === stats.verdicts["NEW LOW"] - 1, "50% filter count matches the NEW LOW count minus the record-low exception", `${applyFilters(deals, { minDiscount: "50" }).length} vs ${stats.verdicts["NEW LOW"]}`);
check(applyFilters(deals, { q: "airpods" }).length >= 3, "search finds the AirPods deals");
check(applyFilters(deals, { q: "zzz-no-match" }).length === 0, "search with no match finds nothing");
check(applyFilters(deals, { sort: "saving" })[0].id === "tcl-qm8l-75", "biggest saving first is the TCL 75-inch TV");
check(applyFilters(deals, { sort: "price" })[0].price <= 20, "lowest price first is under $20");

// --- The site loads nothing from the network -------------------------------
const appDir = join(root, "app");
for (const name of readdirSync(appDir)) {
  const p = join(appDir, name);
  if (!statSync(p).isFile()) continue;
  const text = readFileSync(p, "utf8");
  check(!/src\s*=\s*["']https?:/i.test(text), `${name} has no remote script/image source`);
  check(!/href\s*=\s*["']https?:/i.test(text) || name === "data.js", `${name} has no remote stylesheet link`);
  check(!/@import\s+["']https?:/i.test(text), `${name} has no remote CSS import`);
  check(!/url\(\s*["']?https?:/i.test(text), `${name} has no remote CSS url()`);
  check(!/\bfetch\s*\(/.test(text) && !/XMLHttpRequest/.test(text) && !/WebSocket/.test(text), `${name} makes no network request`);
}
const index = readFileSync(join(appDir, "index.html"), "utf8");
check(index.includes('href="style.css"') && index.includes('src="main.js"'), "index.html loads only local files");
const htmlSize = statSync(join(appDir, "index.html")).size;
check(htmlSize <= 1024 * 1024, "index.html is within the 1 MiB gate cap", `${htmlSize} bytes`);
let appBytes = 0;
for (const name of readdirSync(appDir)) {
  const p = join(appDir, name);
  if (statSync(p).isFile()) appBytes += statSync(p).size;
}
check(appBytes <= 16 * 1024 * 1024, "app/ is within the 16 MiB gate cap", `${appBytes} bytes`);

// --- Screenshots ------------------------------------------------------------
const shotsDir = join(root, "screenshots");
const shots = readdirSync(shotsDir).filter((f) => !f.startsWith("."));
check(shots.length >= 3 && shots.length <= 4, "3 or 4 screenshots", `${shots.length}`);
for (const f of shots) {
  const s = statSync(join(shotsDir, f));
  check(s.size <= 256 * 1024, `screenshot ${f} is within 256 KiB`, `${s.size} bytes`);
  check(/\.(png|jpe?g)$/i.test(f), `screenshot ${f} is PNG or JPEG`);
}

console.log(`\n${checks - failures}/${checks} checks passed (${failures} failed) — ${deals.length} deals, ${stats.stores.length} stores, ${stats.categories.length} categories, $${stats.totalSavings.toFixed(2)} total savings.`);
process.exit(failures === 0 ? 0 : 1);
