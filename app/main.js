// Price Ledger — wiring. Hash routes, live search and filters, and the
// __shotReady flag a screenshot script waits on.
//
//   #/                       the board
//   #/?category=TVs&...      the board, already filtered
//   #/deal/<id>              one deal, with its evidence and cross-store prices
//
// The board re-renders from data.js on every keystroke and every filter
// change: nothing is fetched, nothing leaves the page.

import { deals, CHECKED_LABEL } from "./data.js";
import {
  applyFilters,
  filtersFromHash,
  filtersToHash,
  ledgerStats,
} from "./filters.js";
import { boardPage, dealPage, missingPage, dealRow } from "./views.js";

const app = document.getElementById("app");

function renderBoard(f) {
  const shown = applyFilters(deals, f);
  app.innerHTML = boardPage(deals, shown, f);
  document.title = "Price Ledger — Black Friday 2026";
  const q = app.querySelector("#q");
  const rows = app.querySelector("#rows");
  const countline = app.querySelector("#countline");
  const stats = ledgerStats(deals);

  const refresh = () => {
    const cur = {
      q: q.value,
      category: app.querySelector("#category").value,
      store: app.querySelector("#store").value,
      verdict: app.querySelector("#verdict").value,
      minDiscount: app.querySelector("#discount").value,
      sort: app.querySelector("#sort").value,
    };
    const next = applyFilters(deals, cur);
    rows.innerHTML =
      next.map(dealRow).join("") ||
      '<tr><td colspan="7">No deal matches those filters. Loosen one and try again.</td></tr>';
    countline.textContent = `Showing ${next.length === deals.length ? `${deals.length} deals` : `${next.length} of ${deals.length} deals`} · prices checked ${CHECKED_LABEL}`;
    history.replaceState(null, "", filtersToHash(cur));
    return cur;
  };

  q.addEventListener("input", refresh);
  for (const id of ["category", "store", "verdict", "discount", "sort"]) {
    app.querySelector(`#${id}`).addEventListener("change", refresh);
  }
  q.focus();
}

function render() {
  window.__shotReady = false;
  const match = location.hash.match(/^#\/deal\/([^/?]+)/);
  if (match) {
    const found = deals.find((d) => d.id === decodeURIComponent(match[1]));
    document.title = `${found ? found.title : "Not found"} | Price Ledger`;
    app.innerHTML = found ? dealPage(found) : missingPage();
  } else {
    renderBoard(filtersFromHash(location.hash));
  }
  window.scrollTo(0, 0);
  window.__shotReady = true;
}

window.addEventListener("hashchange", render);
render();
