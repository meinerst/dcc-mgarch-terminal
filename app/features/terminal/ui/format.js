// Display formatters. camelCase (TS/JS guideline). Mono-friendly, terse.

export function money(v, digits = 0) {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

// Dollars at a card's scale: exact below the threshold, abbreviated above it.
//
// The threshold was $1M, which abbreviated the one figure a reader most wants exactly — a
// seven-figure book reading "$1.40M" states the magnitude the card's own title already
// implies and throws away five digits. It is $10M now: eight-figure books abbreviate,
// seven-figure ones do not. The width this was guarding is not binding at either end — the
// widest exact figure is "$9,999,999" (9 mono chars ≈ 151px at 28px), against ~218px of
// desktop card and ~187px of the phone card's text column.
const COMPACT_ABOVE = 1e7;

export function compactMoney(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  const magnitude = Math.abs(v);
  if (magnitude < COMPACT_ABOVE) return money(v);
  const sign = v < 0 ? "-" : "";
  const [scale, suffix] = magnitude >= 1e9 ? [1e9, "B"] : [1e6, "M"];
  return `${sign}$${(magnitude / scale).toFixed(digits)}${suffix}`;
}

export function signedMoney(v, digits = 0) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v >= 0 ? "+" : "-"}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function pct(v, digits = 1) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

// signed integer share count: +650 long, -300 short
export function signedShares(v) {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}${Math.abs(v).toLocaleString("en-US")}`;
}

export function num(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function secs(v, digits = 1) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}s`;
}

// market-clock seconds -> HH:MM:SS wall label. Fed session-anchored seconds (09:30 open
// + accelerated market-elapsed), so it reads as a real trading-session clock.
export function marketClock(seconds) {
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Age of a charted sample, in MARKET time, relative to the newest sample on that chart —
// what the hovered point means to a desk ("10 min ago"), not a wall-clock stamp. Market
// time is the right axis here: the compressed replay makes real elapsed seconds meaningless
// to the trader, while a 5-min bar is 5 min ago whatever the replay factor.
export function marketAgo(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "";
  const s = Math.round(seconds);
  if (s <= 0) return "latest";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m ago`;
}

// VaR forecast horizon label, derived from the data's bar interval (sec_per_bar).
// One bar ahead: 300 -> "5 min-ahead", 60 -> "1 min-ahead", else "{n} sec-ahead".
export function horizonLabel(secPerBar) {
  if (secPerBar == null || Number.isNaN(secPerBar)) return "—"; // unknown until scenario JSON lands
  if (secPerBar % 60 === 0) return `${secPerBar / 60} min-ahead`;
  return `${secPerBar} sec-ahead`;
}

// Friendly scenario label from the raw payload id ("crash" -> "Crash").
export function scenarioLabel(id) {
  if (id == null) return "";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Scenario subset window -> single-day session line, e.g. "Thu 2021-10-14 · 09:30–11:30 ET".
// The close comes from the payload, not from here: the desk plays a session's opening
// stretch, and the label has to say where the replay stops rather than where the day did.
// Defensive: renders whatever fields are present; a bare date still yields a clean line.
export function formatSubset(subset) {
  if (!subset || !subset.date) return "";
  // Parse as UTC midnight so the weekday does not drift with the viewer's timezone.
  const d = new Date(`${subset.date}T00:00:00Z`);
  const dow = Number.isNaN(d.getTime()) ? "" : `${WEEKDAYS[d.getUTCDay()]} `;
  const open = subset.session_open ?? subset.open;
  const close = subset.session_close ?? subset.close;
  const session = open && close ? ` · ${open}–${close}${subset.tz ? ` ${subset.tz}` : ""}` : "";
  return `${dow}${subset.date}${session}`;
}

// blue->red ramp for a correlation value in [0,1]. The clamp is a guard, not a squeeze:
// measured over both baked payloads (27,000 cells each) the observed range is
// 0.15-1.00 with ZERO negatives — 30 large-cap Dow names on 5-min bars all move together.
// The domain stays absolute [0,1] rather than fitting the observed range: a relative ramp
// would restyle the whole matrix whenever the book changes, and the eye reads that as
// correlation moving. The unused low third is the honest price of a comparable scale.
export function corrColor(v) {
  const x = Math.max(0, Math.min(1, v));
  const r = Math.round(37 + x * (220 - 37));
  const g = Math.round(99 - x * (99 - 38));
  const b = Math.round(235 - x * (235 - 38));
  return `rgb(${r},${g},${b})`;
}
