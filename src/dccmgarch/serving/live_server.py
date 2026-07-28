"""HTTP transport for the live desk — the browser drives, one fit per request.

    python -m dccmgarch.serving.live_server         # serve on :8787
    python -m dccmgarch.serving.live_server 9000    # custom port

    GET /health                     -> { "ok": true, "scenarios": [...] }
    GET /live/<scenario>/session    -> pass 1: header + order tape + bar grid (no fits)
    GET /live/<scenario>/bar/<n>    -> one bar's event (reassess / dead / skip)

The terminal fetches ``/session`` once, so the tape and market clock start immediately,
then pulls ``/bar/<n>`` on demand as its clock crosses each bar. Every ``/session`` uses
a fresh seed and echoes it back; the browser threads that seed through the per-bar calls
so the stateless fits reproduce that session's exact tape.

A caller may pin the seed and override pacing (``?seed=&orders_lambda=&max_bars=…``) for
a fork or a curl-driven bake. Each override is type- and range-checked, and an invalid
one answers 400 rather than raising. The terminal sends none.

Stdlib only, and a development transport: it is never part of the static export.
"""

from __future__ import annotations

import json
import logging
import secrets
import sys
from dataclasses import fields
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from ..data import load_prices
from ..live import SessionSpec, build_session_meta, fit_one_bar
from ..scenarios import SCENARIOS

log = logging.getLogger(__name__)

DEFAULT_PORT = 8787

# CORS is granted to loopback callers only. The server already binds 127.0.0.1, but a
# wildcard `Access-Control-Allow-Origin` would still let any page the operator happens to
# be browsing read this port: GET-only and secret-free, yet every /bar call spends real
# multi-second CPU, so a drive-by can pin the machine. Echoing the origin back only when
# it is loopback keeps the one seam that needs it (the Next dev server on :3000 fetching
# :8787) and closes the rest.
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})

# name -> (parser, low, high). The bounds are sanity rails, not model claims: an
# out-of-range value is a 400, never a silently clamped run that costs minutes.
_NUMERIC_OVERRIDES = {
    "replay_factor": (int, 1, 200),
    "sec_per_bar": (int, 1, 3600),
    "reassess_stride": (int, 1, 389),
    # One trading session is 78 five-minute bars; past that the grid leaves the day.
    "session_bars": (int, 1, 78),
    "max_bars": (int, 1, 200),
    "orders_lambda": (float, 1e-9, 20.0),
    # Capped at 1.0 on purpose: past it the arrival slots overlap and the tape stops
    # being ordered, which its construction assumes.
    "order_jitter": (float, 0.0, 1.0),
    "buildup_gaps": (int, 0, 200),
    "min_names_for_risk": (int, 1, 30),
}

# Comma-separated dollar lists, e.g. `order_notionals=10000,15000,20000`.
_NOTIONAL_OVERRIDES = ("order_notionals", "steady_notionals")
_NOTIONAL_BOUNDS = (100.0, 1_000_000.0)

_SPEC_FIELDS = {f.name for f in fields(SessionSpec)}


class BadRequest(ValueError):
    """An override that failed validation — answered with 400, not a traceback."""


def _parse_seed(query: dict[str, list[str]]) -> int:
    """An explicit seed is used verbatim; otherwise a fresh one per session.

    Pinning it is what makes a comparison meaningful: with a fresh seed per request the
    order stream reshuffles and a parameter's effect cannot be separated from RNG noise.
    """
    raw = query.get("seed")
    if not raw:
        return secrets.randbits(32)
    try:
        return int(raw[0])
    except ValueError:
        raise BadRequest(f"seed: expected int, got {raw[0]!r}") from None


def parse_session_spec(query_string: str) -> SessionSpec:
    """Query string -> a validated :class:`SessionSpec`. Unknown keys are ignored."""
    query = parse_qs(query_string)
    overrides: dict = {"seed": _parse_seed(query)}

    for name, (cast, low, high) in _NUMERIC_OVERRIDES.items():
        if name not in query:
            continue
        text = query[name][0]
        try:
            value = cast(text)
        except ValueError:
            raise BadRequest(f"{name}: expected {cast.__name__}, got {text!r}") from None
        if not low <= value <= high:
            raise BadRequest(f"{name}: {value} out of range [{low}, {high}]")
        overrides[name] = value

    low, high = _NOTIONAL_BOUNDS
    for name in _NOTIONAL_OVERRIDES:
        if name not in query:
            continue
        try:
            values = tuple(float(part) for part in query[name][0].split(",") if part.strip())
        except ValueError:
            raise BadRequest(f"{name}: expected comma-separated numbers") from None
        if not values:
            raise BadRequest(f"{name}: at least one notional required")
        if any(not low <= value <= high for value in values):
            raise BadRequest(f"{name}: each notional must be in [{low}, {high}]")
        overrides[name] = values

    unknown = set(overrides) - _SPEC_FIELDS
    if unknown:  # a guard on this module, not on the request
        raise BadRequest(f"unsupported override(s): {sorted(unknown)}")
    return SessionSpec(**overrides)


def parse_book_ts(query_string: str) -> float | None:
    """The opening fit's book-snapshot override, if the caller sent one."""
    raw = parse_qs(query_string).get("book_ts")
    if not raw:
        return None
    try:
        value = float(raw[0])
    except ValueError:
        raise BadRequest(f"book_ts: expected float, got {raw[0]!r}") from None
    if not 0.0 <= value <= 1e9:
        raise BadRequest(f"book_ts: {value} out of range [0.0, 1e9]")
    return value


def local_origin(origin: str | None) -> str | None:
    """The request's Origin if it is loopback, else None (no CORS header at all)."""
    if not origin:
        return None
    return origin if urlparse(origin).hostname in _LOOPBACK_HOSTS else None


class LiveHandler(BaseHTTPRequestHandler):
    # Bars are loaded once at startup and shared read-only across requests.
    prices = None

    def _send(self, status: int, body: dict) -> None:
        encoded = json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self._send_cors()
        self.end_headers()
        self.wfile.write(encoded)

    def _send_cors(self) -> None:
        origin = local_origin(self.headers.get("Origin"))
        if origin is not None:
            self.send_header("Access-Control-Allow-Origin", origin)
        # Cached either way: the answer depends on who asked.
        self.send_header("Vary", "Origin")

    def do_OPTIONS(self) -> None:  # noqa: N802 (http.server API)
        self.send_response(204)
        self._send_cors()
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802 (http.server API)
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        if path == "/health":
            self._send(200, {"ok": True, "scenarios": list(SCENARIOS)})
            return
        if path.startswith("/live/"):
            self._handle_live(path[len("/live/") :], parsed.query)
            return
        self._send(404, {"error": f"not found: {path}"})

    def _handle_live(self, rest: str, query: str) -> None:
        parts = rest.split("/")
        scenario = SCENARIOS.get(parts[0]) if parts else None
        if scenario is None:
            self._send(404, {"error": f"unknown scenario: {parts[0] if parts else ''}"})
            return
        try:
            spec = parse_session_spec(query)
            book_ts = parse_book_ts(query)
        except BadRequest as exc:
            self._send(400, {"error": str(exc)})
            return

        if parts[1:] == ["session"]:
            log.info("session %s (seed=%d)", scenario.id, spec.seed)
            self._send(200, build_session_meta(scenario, prices=self.prices, spec=spec))
            return

        if len(parts) == 3 and parts[1] == "bar":
            try:
                ordinal = int(parts[2])
            except ValueError:
                self._send(400, {"error": f"bar: expected int, got {parts[2]!r}"})
                return
            log.info(
                "fitting %s bar %d (seed=%d) - CPU, honest timing",
                scenario.id, ordinal, spec.seed,
            )
            try:
                event = fit_one_bar(
                    scenario, ordinal, prices=self.prices, spec=spec, book_ts=book_ts
                )
            except IndexError as exc:
                self._send(404, {"error": str(exc)})
                return
            self._send(200, event)
            return

        self._send(404, {"error": f"not found: /live/{rest}"})

    def log_message(self, fmt: str, *args) -> None:  # quieter default access log
        log.info(fmt, *args)


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    port = int(argv[0]) if argv else DEFAULT_PORT
    logging.basicConfig(level=logging.INFO, format="live: %(message)s")

    LiveHandler.prices = load_prices()
    server = ThreadingHTTPServer(("127.0.0.1", port), LiveHandler)
    log.info(
        "live server on http://127.0.0.1:%d (scenarios: %s)",
        port, ", ".join(SCENARIOS),
    )
    log.info(
        "  set NEXT_PUBLIC_DATA_MODE=live and NEXT_PUBLIC_LIVE_URL=http://127.0.0.1:%d", port
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("live server stopped.")
        server.shutdown()


if __name__ == "__main__":
    main()
