"""The simulated order tape and the book it builds.

Orders are the only thing the demo invents: prices are real bars, and an order moves
portfolio weights without touching the price model, so the tape need not align to bar
boundaries. It is seeded, so the same seed always produces the same session — which is
exactly what makes a recorded run reproducible and a live run fresh.

Nothing here fits a model. Everything is a pure function of the seed and the bar grid.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from ..data import UNIVERSE
from ..portfolio import Portfolio
from .config import BUILDUP_GROW_PROB, ORDER_JITTER
from .grid import Bar, gap_windows


def net_book(orders: list[dict], tickers: list[str]) -> dict[str, float]:
    """Net signed shares per ticker across the orderflow so far."""
    net = {ticker: 0.0 for ticker in tickers}
    for order in orders:
        if order["asset"] in net:
            net[order["asset"]] += float(order["shares"])
    return net


def held_names(book: dict[str, float]) -> int:
    """Names carrying a non-zero position. A name traded back to flat does not count."""
    return sum(1 for shares in book.values() if shares != 0)


def portfolio_from_orderflow(
    orders: list[dict], tickers: list[str], prices: pd.Series
) -> Portfolio:
    """The holdings the tape has accumulated, struck at ``prices``.

    The session opens flat and each order's signed shares accrue into its ticker, so the
    priced portfolio is exactly what the tape built — the same book the terminal shows,
    not a frozen stand-in. Names with no fills yet carry zero shares.
    """
    net = net_book(orders, tickers)
    shares = pd.Series(net, dtype=float).reindex(tickers)
    return Portfolio(shares=shares, prices=prices.reindex(tickers).astype(float))


def book_ready_ts(orders: list[dict], min_names_for_risk: int) -> float | None:
    """When the tape first holds ``min_names_for_risk`` names, or ``None`` if never.

    The opening fit fires the moment risk becomes computable rather than at the next
    bar — a book that goes live at 09:31:40 should not sit unpriced until 09:35. Derived
    from the order schedule alone, so a recording can stamp the event before any fit runs.
    """
    net = {ticker: 0.0 for ticker in UNIVERSE}
    for order in orders:
        if order["asset"] not in net:
            continue
        net[order["asset"]] += float(order["shares"])
        if held_names(net) >= min_names_for_risk:
            return float(order["market_ts"])
    return None


def book_dip_below(
    orders: list[dict], min_names_for_risk: int, start_ts: float, end_ts: float
) -> int | None:
    """Held-name count at the first dip under the floor in ``(start_ts, end_ts]``.

    Returns the count rather than a flag so an aborted event can report the number that
    caused it — a dead event claiming the book held three names would contradict itself.

    This is the recorded twin of the live desk's abort guard: an opening fit launched on
    a three-name book is moot if a trim flattens a name before it lands. The live engine
    watches its own book in real time; a recording has to replay the tape across the
    window the fit occupied and reach the same verdict, or the two modes disagree on the
    same seed.
    """
    net = net_book([o for o in orders if o["market_ts"] <= start_ts], UNIVERSE)
    for order in orders:
        if not start_ts < order["market_ts"] <= end_ts:
            continue
        if order["asset"] in net:
            net[order["asset"]] += float(order["shares"])
        held = held_names(net)
        if held < min_names_for_risk:
            return held
    return None


def _notional_shares(notional: float, fill_price: float, sign: int) -> int:
    """A dollar notional as whole signed shares at the fill price."""
    return max(1, int(round(notional / fill_price))) * sign


def _buildup_shares(
    rng, book: dict[str, float], asset: str, fill_price: float, notionals: tuple
) -> int:
    """An opening order: grow the name's position so gross exposure ramps.

    A flat name is opened on a random side; a held name is added to most of the time and
    lightly trimmed otherwise, so the book builds without being a perfectly monotone ramp.
    """
    notional = float(rng.choice(notionals))
    held = book[asset]
    if held == 0:
        sign = 1 if rng.random() < 0.5 else -1
    else:
        sign = int(math.copysign(1, held)) * (1 if rng.random() < BUILDUP_GROW_PROB else -1)
    return _notional_shares(notional, fill_price, sign)


def _steady_shares(
    rng,
    book: dict[str, float],
    targets: dict[str, float],
    asset: str,
    fill_price: float,
    notionals: tuple,
) -> int:
    """A churn order that mean-reverts the name toward the book buildup froze.

    Off target by at least one order size, it trades toward the target; already near it,
    a small random jitter keeps the tape alive. Either way the order is small and
    self-correcting, so gross exposure barely moves — the point is activity the eye can
    ignore, not exposure the model must chase.
    """
    size = _notional_shares(float(rng.choice(notionals)), fill_price, 1)
    gap = targets[asset] - book[asset]
    if abs(gap) >= size:
        sign = int(math.copysign(1, gap))  # back toward the built-up target
    else:
        sign = 1 if rng.random() < 0.5 else -1  # near target: gross-neutral jitter
    return size * sign


def build_order_tape(
    rng,
    bars: list[Bar],
    *,
    orders_lambda: float,
    buildup_gaps: int,
    order_notionals: tuple,
    steady_notionals: tuple,
    sec_per_bar: int,
    tail_gaps: int,
    order_jitter: float = ORDER_JITTER,
) -> list[dict]:
    """The whole seeded order schedule, stamped on the market clock.

    Stratified arrivals per gap, placed strictly inside the open interval so no order
    collides with a bar boundary. The fill price is the preceding bar's — the last price
    known at that market time. The running book is mutated in place so several orders in
    one gap compound, and ``targets`` freezes as the book standing at the end of buildup.
    Sequential over gaps (the book requires it), but nothing is fitted.
    """
    orders: list[dict] = []
    book = {ticker: 0.0 for ticker in UNIVERSE}
    targets: dict[str, float] | None = None

    windows = gap_windows(bars, sec_per_bar=sec_per_bar, tail_gaps=tail_gaps)
    for gap_index, (start_ts, end_ts, fill_bar) in enumerate(windows, start=1):
        phase = "buildup" if gap_index <= buildup_gaps else "steady"
        if phase == "steady" and targets is None:
            targets = dict(book)  # freeze the built-up book as the reversion target
        # Exact rate: the fractional part of lambda is a coin flip, not Poisson noise.
        count = int(orders_lambda) + int(rng.random() < orders_lambda % 1.0)
        eps = (end_ts - start_ts) * 1e-6  # keep arrivals strictly inside the gap
        slot = (end_ts - start_ts - 2 * eps) / max(count, 1)
        centers = (start_ts + eps) + (np.arange(count) + 0.5) * slot
        arrivals = centers + rng.uniform(-0.5, 0.5, count) * slot * order_jitter
        for order_ts in arrivals:
            asset = UNIVERSE[int(rng.integers(0, len(UNIVERSE)))]
            fill_price = float(fill_bar[asset])
            if phase == "buildup":
                shares = _buildup_shares(rng, book, asset, fill_price, order_notionals)
            else:
                shares = _steady_shares(
                    rng, book, targets, asset, fill_price, steady_notionals
                )
            book[asset] += shares
            orders.append(
                {
                    "type": "order",
                    "market_ts": round(float(order_ts), 2),
                    "asset": asset,
                    "side": "buy" if shares > 0 else "sell",
                    "shares": shares,
                    "fillPrice": round(fill_price, 2),
                }
            )
    return orders
