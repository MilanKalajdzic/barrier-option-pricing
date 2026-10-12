// Page wiring: reads the controls, runs the pricing modules and draws the charts.
// The only module that touches the DOM; all maths lives in pricing.js, mc.js and hedging.js.

import { bsCallDelta, uocDelta, uocGamma } from "./pricing.js";
import { closedFormPrices, hedgingStudy, pricerSimulations } from "./studies.js";

const $ = (id) => document.getElementById(id);
const hasCharts = typeof window.Chart !== "undefined";

const MONITORING = {
  continuous: { perYear: null, label: "continuous" },
  daily: { perYear: 252, label: "daily" },
  weekly: { perYear: 52, label: "weekly" },
  monthly: { perYear: 12, label: "monthly" },
};
const EXPIRIES = [
  { years: 1 / 252, label: "1 day" },
  { years: 5 / 252, label: "1 week" },
  { years: 21 / 252, label: "1 month" },
  { years: 0.25, label: "3 months" },
  { years: 0.5, label: "6 months" },
  { years: 1, label: "1 year" },
];
const REBALANCE_DAYS = [21, 10, 5, 2, 1];
const CONTRACT_IDS = ["S0", "K", "H", "sigma", "r", "T"];
const MC_PATHS = 20000;
const HEDGE_PATHS = 2000;
const GRID_POINTS = 300;

// ---------- small helpers ----------

const fmt = (x, dp = 4) => x.toFixed(dp);
const pct = (x, dp = 1) => `${(100 * x).toFixed(dp)}%`;
const signed = (x, dp) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(dp);

function setStatus(id, text) {
  const el = $(id);
  el.hidden = !text;
  el.textContent = text || "";
}

function quantile(values, q) {
  const s = Float64Array.from(values).sort();
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function std(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
}

// Points where y changes sign, interpolated; values within 1e-6 of the largest |y| count as
// zero, so finite-difference noise in flat regions does not create spurious crossings.
function signChanges(xs, ys) {
  const tol = 1e-6 * Math.max(...ys.map(Math.abs));
  const out = [];
  let last = -1;
  for (let i = 0; i < xs.length; i++) {
    if (Math.abs(ys[i]) <= tol) continue;
    if (last >= 0 && Math.sign(ys[i]) !== Math.sign(ys[last])) {
      const a = ys[last];
      const b = ys[i];
      out.push(xs[last] + ((xs[i] - xs[last]) * a) / (a - b));
    }
    last = i;
  }
  return out;
}

function palette() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    blue: v("--blue"),
    orange: v("--orange"),
    red: v("--red"),
    marker: v("--marker"),
    muted: v("--muted"),
    grid: v("--grid"),
  };
}

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ---------- simulations in a Web Worker ----------

const LOCAL_TASKS = { pricer: pricerSimulations, hedging: hedgingStudy };

// One worker per task. A request that arrives while the previous one is still running
// terminates it, so the latest inputs are always the next to finish; results of superseded
// requests are ignored. Falls back to running on the main thread if workers are unavailable.
function makeRunner(task, pendingIds, onResult) {
  let worker = null;
  let busy = false;
  let latest = 0;
  const setPending = (on) => pendingIds.forEach((id) => $(id).classList.toggle("pending", on));
  const deliver = (result) => {
    busy = false;
    setPending(false);
    onResult(result);
  };
  const start = () => {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      if (data.id === latest) deliver(data.result);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      worker = null;
      deliver(LOCAL_TASKS[task](lastArgs));
    };
  };
  let lastArgs = null;
  return (args) => {
    latest += 1;
    lastArgs = args;
    setPending(true);
    if (typeof Worker === "undefined") {
      setTimeout(() => deliver(LOCAL_TASKS[task](args)), 0);
      return;
    }
    if (busy || !worker) {
      worker?.terminate();
      start();
    }
    busy = true;
    worker.postMessage({ id: latest, task, args });
  };
}

// ---------- contract ----------

function readContract() {
  const c = {};
  for (const id of CONTRACT_IDS) c[id] = Number($(id).value);
  return c;
}

function showContract(c) {
  $("S0-out").textContent = c.S0.toFixed(0);
  $("K-out").textContent = c.K.toFixed(0);
  $("H-out").textContent = c.H.toFixed(0);
  $("sigma-out").textContent = pct(c.sigma, 0);
  $("r-out").textContent = pct(c.r, 1);
  $("T-out").textContent = `${c.T.toFixed(1)} y`;
}

// ---------- 1. pricer ----------

const mcText = (res) => `${fmt(res.price)} ± ${fmt(1.96 * res.stdError, 3)}`;

function updatePricer(c) {
  const mode = MONITORING[$("monitoring").value];
  const p = closedFormPrices(c, mode.perYear);
  const steps = p.steps;

  $("price-cont").textContent = fmt(p.cont);
  $("price-monitored").textContent = fmt(p.monitored);
  $("monitored-label").textContent = mode.perYear
    ? `Closed form + BGK shift, ${mode.label} checks (approx.)`
    : "Closed form, continuous checks";
  $("monitoring-note").textContent = mode.perYear
    ? `barrier shifted to ${fmt(p.shifted, 2)} · ${steps} check${steps === 1 ? "" : "s"}`
    : "no shift needed";
  $("price-vanilla").textContent = fmt(p.vanilla);
  $("discount").textContent = p.discount === null ? "–" : pct(p.discount);

  setStatus("pricer-status", p.deadReason && `The option is worthless: ${p.deadReason}.`);

  $("mc-discrete-card").hidden = !mode.perYear;
  runPricer({ contract: c, steps, nPaths: MC_PATHS, seed: 1, discrete: Boolean(mode.perYear) });
}

function showPricerSimulations({ discrete, bridge }) {
  if (discrete) $("mc-discrete").textContent = mcText(discrete);
  $("mc-bridge").textContent = mcText(bridge);
}

const runPricer = makeRunner("pricer", ["mc-cards"], showPricerSimulations);

// ---------- 2. Greeks explorer ----------

let deltaChart;
let gammaChart;

function buildExpiryControl() {
  const fieldset = $("expiry");
  EXPIRIES.forEach((e, i) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "expiry";
    input.value = String(i);
    input.checked = e.label === "1 year";
    const span = document.createElement("span");
    span.textContent = e.label;
    label.append(input, span);
    fieldset.append(label);
  });
}

function selectedExpiry(c) {
  const inputs = [...document.querySelectorAll('input[name="expiry"]')];
  inputs.forEach((input, i) => {
    input.disabled = EXPIRIES[i].years > c.T + 1e-9;
  });
  let chosen = inputs.find((input) => input.checked && !input.disabled);
  if (!chosen) {
    chosen = inputs.filter((input) => !input.disabled).at(-1);
    chosen.checked = true;
  }
  return EXPIRIES[Number(chosen.value)];
}

function lineChart(canvas, xTitle, yTitle, { logX = false, logY = false } = {}) {
  return new window.Chart(canvas, {
    type: "line",
    data: { datasets: [] },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      interaction: { mode: "nearest", axis: "x", intersect: false },
      elements: { point: { radius: 0 } },
      plugins: {
        legend: { labels: { boxWidth: 14, filter: (item) => !item.text.startsWith("_") } },
        tooltip: {
          filter: (item) => !item.dataset.marker,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toPrecision(4)}` },
        },
      },
      scales: {
        x: { type: logX ? "logarithmic" : "linear", title: { display: true, text: xTitle } },
        y: { type: logY ? "logarithmic" : "linear", title: { display: true, text: yTitle } },
      },
    },
  });
}

// Vertical marker lines drawn as two-point datasets spanning the curves' range.
function markers(xs, label, color, ys, dash) {
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pad = 0.05 * (hi - lo || 1);
  return xs.map((x, i) => ({
    label: i === 0 ? label : `_${label}`,
    data: [
      { x, y: lo - pad },
      { x, y: hi + pad },
    ],
    borderColor: color,
    borderWidth: 1.2,
    borderDash: dash,
    marker: true,
  }));
}

function updateGreeks(c) {
  const expiry = selectedExpiry(c);
  const tau = expiry.years;
  const xs = [];
  const delta = [];
  const gamma = [];
  const vanillaDelta = [];
  const lo = 0.55 * c.H;
  const hi = 0.999 * c.H;
  for (let i = 0; i < GRID_POINTS; i++) {
    const S = lo + ((hi - lo) * i) / (GRID_POINTS - 1);
    xs.push(S);
    delta.push(uocDelta(S, c.K, c.H, c.r, c.sigma, tau));
    gamma.push(uocGamma(S, c.K, c.H, c.r, c.sigma, tau));
    vanillaDelta.push(bsCallDelta(S, c.K, c.r, c.sigma, tau));
  }
  const deltaFlips = signChanges(xs, delta);
  const gammaFlips = signChanges(xs, gamma);

  if (c.K >= c.H) {
    $("greeks-readout").textContent =
      "The option is worthless for these inputs (strike at or above the barrier), so its Greeks are zero.";
  } else {
    const list = (flips) => (flips.length ? `S ≈ ${flips.map((s) => s.toFixed(1)).join(", ")}` : "nowhere on this range");
    $("greeks-readout").textContent =
      `${expiry.label} to expiry. Delta at S = ${hi.toFixed(1)}: ${signed(delta.at(-1), 3)} ` +
      `(vanilla ${signed(vanillaDelta.at(-1), 2)}). Delta changes sign at ${list(deltaFlips)}; ` +
      `gamma at ${list(gammaFlips)}.`;
  }

  if (!hasCharts) return;
  const p = palette();
  const pts = (ys) => xs.map((x, i) => ({ x, y: ys[i] }));
  const allDelta = [...delta, ...vanillaDelta];
  deltaChart.data.datasets = [
    { label: "Up-and-out call", data: pts(delta), borderColor: p.orange, borderWidth: 2.5 },
    { label: "Vanilla call", data: pts(vanillaDelta), borderColor: p.blue, borderWidth: 1.5, borderDash: [6, 4] },
    ...markers([c.H], "Barrier", p.red, allDelta, [2, 3]),
    ...markers(deltaFlips, "Sign change", p.marker, allDelta, [5, 4]),
  ];
  gammaChart.data.datasets = [
    { label: "Up-and-out call", data: pts(gamma), borderColor: p.orange, borderWidth: 2.5 },
    ...markers([c.H], "Barrier", p.red, gamma, [2, 3]),
    ...markers(gammaFlips, "Sign change", p.marker, gamma, [5, 4]),
  ];
  for (const chart of [deltaChart, gammaChart]) chart.update("none");
}

// ---------- 3. hedging simulator ----------

let seed = 1;
let hedge = null;
let histChart;
let stdChart;

const runHedging = makeRunner("hedging", ["hedge-body"], (result) => {
  hedge = result;
  renderHedging();
});

function requestHedging(c) {
  runHedging({ contract: c, rebalanceDays: REBALANCE_DAYS, nPaths: HEDGE_PATHS, seed });
}

function renderHedging() {
  const idx = Number($("rebalance").value);
  const days = REBALANCE_DAYS[idx];
  $("rebalance-out").textContent = days === 1 ? "day" : `${days} days`;
  if (!hedge) return;
  const why = {
    worthless: "Nothing to hedge: the barrier option is worthless for these inputs.",
    negligible:
      "Nothing meaningful to hedge: the barrier option's premium is under 0.01% of the spot, so P&L measured against it is just noise.",
  };
  setStatus("hedge-status", hedge.dead && why[hedge.reason]);
  $("hedge-body").hidden = hedge.dead;
  if (hedge.dead) return;

  const u = hedge.relPnl.uoc[idx];
  const v = hedge.relPnl.vanilla[idx];
  const rows = [
    ["Vanilla call", "--blue", v],
    ["Up-and-out call", "--orange", u],
  ];
  $("hedge-table").tBodies[0].innerHTML = rows
    .map(
      ([name, color, x]) =>
        `<tr><td><span class="swatch" style="background: var(${color})"></span>${name}</td>` +
        `<td>${fmt(std(x), 3)}</td><td>${signed(quantile(x, 0.01), 2)}</td>` +
        `<td>${signed(quantile(x, 0.99), 2)}</td></tr>`,
    )
    .join("");

  if (!hasCharts) return;
  const p = palette();

  // Histogram on shared symmetric bins; values beyond ±L are piled into the end bins.
  const L = Math.max(3, Math.ceil(2 * quantile(Float64Array.from(u, Math.abs), 0.995)) / 2);
  const nBins = 61;
  const width = (2 * L) / nBins;
  const density = (x) => {
    const counts = new Array(nBins).fill(0);
    for (const value of x) counts[Math.min(nBins - 1, Math.max(0, Math.floor((value + L) / width)))]++;
    return counts.map((n) => (n > 0 ? n / (x.length * width) : null));
  };
  histChart.data = {
    labels: Array.from({ length: nBins }, (_, i) => (-L + (i + 0.5) * width).toFixed(2)),
    datasets: [
      { label: "Vanilla call", data: density(v), backgroundColor: withAlpha(p.blue, 0.65), grouped: false },
      { label: "Up-and-out call", data: density(u), backgroundColor: withAlpha(p.orange, 0.55), grouped: false },
    ],
  };
  histChart.options.plugins.title.text = `P&L / premium, rebalancing every ${days === 1 ? "day" : `${days} days`} (log scale, tails beyond ±${L} piled into the end bins)`;
  histChart.update("none");

  const perYear = REBALANCE_DAYS.map((d) => 252 / d);
  const series = (option) => perYear.map((x, i) => ({ x, y: std(hedge.relPnl[option][i]) }));
  const vanillaSeries = series("vanilla");
  const reference = perYear.map((x) => ({ x, y: vanillaSeries[0].y * Math.sqrt(perYear[0] / x) }));
  stdChart.data.datasets = [
    { label: "Vanilla call", data: vanillaSeries, borderColor: p.blue, backgroundColor: p.blue, pointRadius: 4 },
    { label: "Up-and-out call", data: series("uoc"), borderColor: p.orange, backgroundColor: p.orange, pointRadius: 4 },
    { label: "∝ 1/√rebalances", data: reference, borderColor: p.muted, borderDash: [3, 4], borderWidth: 1.5 },
  ];
  stdChart.update("none");
}

function histogramChart(canvas) {
  return new window.Chart(canvas, {
    type: "bar",
    data: { labels: [], datasets: [] },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      barPercentage: 1,
      categoryPercentage: 1,
      plugins: {
        title: { display: true, text: "", font: { weight: "normal" } },
        tooltip: { callbacks: { title: (items) => `P&L / premium ≈ ${items[0].label}` } },
      },
      scales: {
        x: {
          // Label only the bins that contain a whole number.
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            callback(value, index) {
              const centre = Number(this.chart.data.labels[index]);
              const width = Number(this.chart.data.labels[1]) - Number(this.chart.data.labels[0]);
              const whole = Math.round(centre);
              return Math.abs(centre - whole) <= width / 2 ? String(whole) : "";
            },
          },
          title: { display: true, text: "P&L / premium" },
        },
        y: {
          type: "logarithmic",
          ticks: { callback: (v) => (Number.isInteger(Math.log10(v)) ? String(v) : "") },
          title: { display: true, text: "Density" },
        },
      },
    },
  });
}

// ---------- wiring ----------

function applyChartTheme() {
  if (!hasCharts) return;
  const p = palette();
  window.Chart.defaults.color = p.muted;
  window.Chart.defaults.borderColor = p.grid;
  window.Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
}

function updateAll() {
  const c = readContract();
  showContract(c);
  updatePricer(c);
  updateGreeks(c);
  requestHedging(c);
}

function debounced(fn, ms = 150) {
  let timer;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function init() {
  buildExpiryControl();
  applyChartTheme();
  if (hasCharts) {
    deltaChart = lineChart($("chart-delta"), "Spot", "Delta");
    gammaChart = lineChart($("chart-gamma"), "Spot", "Gamma");
    histChart = histogramChart($("chart-hist"));
    stdChart = lineChart($("chart-std"), "Rebalances per year", "Std of P&L / premium", {
      logX: true,
      logY: true,
    });
    stdChart.options.elements.point.radius = 4;
  } else {
    for (const box of document.querySelectorAll(".chart-box")) box.hidden = true;
  }

  const recomputeAll = debounced(updateAll);
  for (const id of CONTRACT_IDS) {
    $(id).addEventListener("input", () => {
      showContract(readContract());
      recomputeAll();
    });
  }
  $("monitoring").addEventListener("change", () => updatePricer(readContract()));
  $("expiry").addEventListener("change", () => updateGreeks(readContract()));
  $("rebalance").addEventListener("input", renderHedging);
  $("new-paths").addEventListener("click", () => {
    seed += 1;
    requestHedging(readContract());
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    applyChartTheme();
    updateGreeks(readContract());
    renderHedging();
  });

  renderHedging(); // sets the rebalance read-out before the first simulation arrives
  updateAll();
}

init();
