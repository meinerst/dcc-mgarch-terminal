"""The live session: bar grid, order tape and the book they build.

These are the parts of the desk that must be reproducible from a seed alone — that is
what lets a recording replay a live run and a stateless per-bar server reconstruct the
session the browser is already playing. No model is fitted here; the fits have their own
coverage in the golden master.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from dccmgarch.data import UNIVERSE, load_prices
from dccmgarch.live import SessionSpec, build_session_meta, fit_one_bar
from dccmgarch.live.config import SESSION_BARS
from dccmgarch.live.grid import build_bar_grid, gap_windows
from dccmgarch.live.orders import (
    book_dip_below,
    book_ready_ts,
    held_names,
    net_book,
    portfolio_from_orderflow,
)
from dccmgarch.live.session import demo_day, plan_session, session_close, session_header
from dccmgarch.pipeline import VarResult
from dccmgarch.scenarios import SCENARIOS


@pytest.fixture(scope="module")
def prices():
    return load_prices()


@pytest.fixture(scope="module")
def calm():
    return SCENARIOS["calm"]


@pytest.fixture(scope="module")
def crash():
    return SCENARIOS["crash"]


def grid_for(prices, scenario, **kwargs):
    """The desk's own grid, with only the argument under test varied."""
    kwargs.setdefault("session_day", demo_day(scenario))
    kwargs.setdefault("session_bars", SESSION_BARS)
    kwargs.setdefault("reassess_stride", 1)
    kwargs.setdefault("sec_per_bar", 300)
    return build_bar_grid(prices, scenario, **kwargs)


def order(market_ts: float, asset: str, shares: float) -> dict:
    return {"type": "order", "market_ts": market_ts, "asset": asset, "shares": shares}


# Three names taken FROM the universe rather than written as literals. book_ready_ts
# and book_dip_below both net against UNIVERSE and skip anything outside it, so a
# hardcoded symbol silently scores zero held names on any bar file whose columns are
# labelled differently — the tests would still run, and quietly assert nothing.
A, B, C = UNIVERSE[0], UNIVERSE[1], UNIVERSE[2]


# --- the bar grid ----------------------------------------------------------------


def test_grid_lands_on_the_market_clock(prices, calm):
    bars = grid_for(prices, calm)

    assert len(bars) == SESSION_BARS
    assert [b.ordinal for b in bars] == list(range(SESSION_BARS))
    assert [b.market_ts for b in bars] == [300.0 * i for i in range(SESSION_BARS)]


# The whole point of the single-session cut: market_ts is seconds after THIS day's open,
# so the desk's clock can read 09:47 and mean it. A stride across the five-day window
# stamped bars 5 minutes apart that were 65 minutes apart in the file.
@pytest.mark.parametrize("scenario_id", ["calm", "crash"])
def test_the_grid_is_one_real_session_in_order(prices, scenario_id):
    scenario = SCENARIOS[scenario_id]
    bars = grid_for(prices, scenario)
    stamps = [bar.market_bar.name for bar in bars]
    day = pd.Timestamp(demo_day(scenario))

    assert pd.Timestamp(stamps[0]) == day + pd.Timedelta(hours=9, minutes=30)
    assert all(pd.Timestamp(ts).normalize() == day for ts in stamps)
    assert [
        (pd.Timestamp(b) - pd.Timestamp(a)).total_seconds()
        for a, b in zip(stamps, stamps[1:], strict=False)
    ] == [300.0] * (len(bars) - 1)


def test_a_demo_day_outside_the_window_is_refused(prices, calm):
    # The public repository's data is trimmed to the days the frozen windows read, so a
    # day outside one resolves here and 404s there.
    with pytest.raises(ValueError, match="outside the window"):
        grid_for(prices, calm, session_day="2021-09-01")


def test_a_session_that_runs_past_the_window_is_refused(prices, calm):
    with pytest.raises(ValueError, match="past the window"):
        grid_for(prices, calm, session_bars=78)


def test_each_bar_is_priced_at_the_last_row_of_its_own_window(prices, calm):
    bars = grid_for(prices, calm)

    for bar in bars[:3]:
        assert bar.market_bar.equals(bar.est_window.iloc[-1])
        assert len(bar.est_window) == 390  # 5 trading days of 5-minute bars


def test_truncating_a_run_does_not_coarsen_the_grid(prices, calm):
    full = grid_for(prices, calm)
    short = grid_for(prices, calm, max_bars=5)

    assert len(short) == 5
    assert [b.market_ts for b in short] == [b.market_ts for b in full[:5]]


def test_tape_is_scheduled_past_the_last_bar(prices, calm):
    bars = grid_for(prices, calm)
    windows = gap_windows(bars, sec_per_bar=300, tail_gaps=4)

    assert len(windows) == len(bars) - 1 + 4
    # Tail gaps fill at the last real bar's prices: prices past the grid do not exist.
    assert all(w[2].equals(bars[-1].market_bar) for w in windows[-4:])


# --- the order tape --------------------------------------------------------------


def tape_for(prices, scenario, seed: int, **spec_kwargs) -> list[dict]:
    spec = SessionSpec(seed=seed, **spec_kwargs)
    _, orders = plan_session(prices, scenario, spec)
    return orders


def test_the_same_seed_replays_the_same_tape(prices, calm):
    assert tape_for(prices, calm, 42) == tape_for(prices, calm, 42)


def test_a_different_seed_is_a_different_session(prices, calm):
    assert tape_for(prices, calm, 42) != tape_for(prices, calm, 43)


def test_arrivals_are_ordered_and_never_land_on_a_bar_boundary(prices, calm):
    bars = grid_for(prices, calm)
    orders = tape_for(prices, calm, 42)

    stamps = [o["market_ts"] for o in orders]
    assert stamps == sorted(stamps)
    boundaries = {b.market_ts for b in bars}
    assert not boundaries.intersection(stamps)


# The rate is exact rather than Poisson: exponential inter-arrivals are the maximally
# bursty process at a given rate, which read as clusters and dead voids on the tape.
def test_the_arrival_rate_is_exact_not_poisson(prices, calm):
    orders = tape_for(prices, calm, 42, orders_lambda=15.0)
    bars = grid_for(prices, calm)

    assert len(orders) == 15 * (len(bars) - 1 + 4)  # gaps plus the tail


def test_a_fractional_rate_is_carried_as_a_coin_flip(prices, calm):
    orders = tape_for(prices, calm, 42, orders_lambda=15.5)
    gaps = len(grid_for(prices, calm)) - 1 + 4

    assert 15 * gaps <= len(orders) <= 16 * gaps


def test_zero_jitter_is_a_metronome(prices, calm):
    orders = tape_for(prices, calm, 42, order_jitter=0.0, orders_lambda=15.0)
    first_gap = [o["market_ts"] for o in orders if o["market_ts"] < 300]

    spacings = np.diff(first_gap)
    assert spacings.std() < 1e-6


def test_jitter_never_reorders_arrivals(prices, calm):
    stamps = [o["market_ts"] for o in tape_for(prices, calm, 42, order_jitter=1.0)]
    assert stamps == sorted(stamps)


def test_orders_only_ever_touch_the_investable_universe(prices, calm):
    assert {o["asset"] for o in tape_for(prices, calm, 42)} <= set(UNIVERSE)


def test_side_mirrors_the_sign_of_the_fill(prices, calm):
    for o in tape_for(prices, calm, 42):
        assert o["side"] == ("buy" if o["shares"] > 0 else "sell")
        assert o["shares"] != 0  # a zero-share order would be a fill that never happened


# Orders are dollar notionals, not share counts: across names spanning ~$20-$500 a fixed
# share count would let the expensive names dominate gross exposure on their own.
def test_order_size_is_a_dollar_notional(prices, calm):
    orders = tape_for(prices, calm, 42, order_notionals=(10_000.0,), steady_notionals=(10_000.0,))
    buildup = [o for o in orders if o["market_ts"] < 300]

    for o in buildup:
        assert abs(abs(o["shares"]) * o["fillPrice"] - 10_000.0) < o["fillPrice"]


def test_the_book_stops_ramping_once_buildup_ends(prices, calm):
    bars = grid_for(prices, calm)
    orders = tape_for(prices, calm, 42, buildup_gaps=12)

    def gross_at(ts):
        book = net_book([o for o in orders if o["market_ts"] <= ts], UNIVERSE)
        prices_at = {o["asset"]: o["fillPrice"] for o in orders if o["market_ts"] <= ts}
        return sum(abs(v) * prices_at.get(k, 0.0) for k, v in book.items())

    end_of_buildup = gross_at(bars[12].market_ts)
    end_of_run = gross_at(bars[-1].market_ts)

    assert end_of_buildup > 0
    assert abs(end_of_run - end_of_buildup) / end_of_buildup < 0.35


# --- the book --------------------------------------------------------------------


def test_net_book_accumulates_signed_shares():
    orders = [order(1, "AAPL", 100), order(2, "AAPL", -40), order(3, "JPM", 10)]

    assert net_book(orders, ["AAPL", "JPM", "CVX"]) == {"AAPL": 60.0, "JPM": 10.0, "CVX": 0.0}


def test_a_name_traded_back_to_flat_is_not_held():
    book = net_book([order(1, "AAPL", 100), order(2, "AAPL", -100)], ["AAPL", "JPM"])

    assert held_names(book) == 0


def test_the_priced_book_is_exactly_what_the_tape_built():
    orders = [order(1, "AAPL", 100), order(2, "JPM", -50)]
    import pandas as pd

    prices = pd.Series({"AAPL": 50.0, "JPM": 30.0, "CVX": 80.0})
    portfolio = portfolio_from_orderflow(orders, ["AAPL", "JPM", "CVX"], prices)

    assert list(portfolio.shares) == [100.0, -50.0, 0.0]
    assert portfolio.tickers == ["AAPL", "JPM", "CVX"]


def test_book_ready_is_the_crossing_not_the_next_bar():
    orders = [order(10, A, 100), order(20, B, 100), order(30, C, 100)]

    assert book_ready_ts(orders, 3) == 30.0
    assert book_ready_ts(orders, 4) is None


def test_book_ready_ignores_a_name_that_never_leaves_flat():
    orders = [
        order(10, A, 100),
        order(20, B, 100),
        order(30, B, -100),
        order(40, C, 100),
    ]

    assert book_ready_ts(orders, 3) is None  # only two names are ever held at once


def test_a_dip_reports_the_count_that_caused_it():
    orders = [
        order(10, A, 100),
        order(20, B, 100),
        order(30, C, 100),
        order(60, C, -100),
    ]

    assert book_dip_below(orders, 3, 30.0, 100.0) == 2
    assert book_dip_below(orders, 3, 30.0, 50.0) is None  # the dip is outside the window


# --- session entry points --------------------------------------------------------


def test_session_meta_echoes_the_seed_the_bars_were_built_from(prices, calm):
    meta = build_session_meta(calm, prices=prices, spec=SessionSpec(seed=7))

    assert meta["seed"] == 7
    assert meta["scenario"] == "calm"
    assert meta["spotlight_assets"] == UNIVERSE
    assert [b["ordinal"] for b in meta["bars"]] == list(range(SESSION_BARS))


# The label is what the viewer checks the clock against, so it is derived from the grid
# rather than written down: it named 09:30-16:00 while the run stopped a quarter of the
# way in, and dated a five-day stride as a single session.
@pytest.mark.parametrize("scenario_id", ["calm", "crash"])
def test_the_header_names_the_session_the_grid_actually_plays(prices, scenario_id):
    scenario = SCENARIOS[scenario_id]
    header = session_header(scenario, SessionSpec())

    assert header["session"]["date"] == demo_day(scenario)
    assert header["subset"]["date"] == demo_day(scenario)
    assert header["session"]["open"] == "09:30"
    assert header["session"]["close"] == "11:30"  # 24 bars x 5 market-minutes
    assert header["subset"]["session_close"] == header["session"]["close"]


def test_a_truncated_run_closes_when_it_stops(prices, calm):
    assert session_close(SessionSpec(max_bars=6)) == "10:00"


def test_session_meta_costs_no_fits(prices, calm):
    meta = build_session_meta(calm, prices=prices, spec=SessionSpec(seed=7))

    assert "events" not in meta  # a plan, not a recording
    assert meta["orders"]


def test_an_unknown_bar_is_an_error_not_an_empty_answer(prices, calm):
    with pytest.raises(IndexError):
        fit_one_bar(calm, 99, prices=prices, spec=SessionSpec(seed=7))


# A bar whose book is too thin runs no fit at all: no result exists, so none is invented.
def test_a_thin_book_is_dead_rather_than_priced(prices, calm):
    event = fit_one_bar(calm, 0, prices=prices, spec=SessionSpec(seed=7, min_names_for_risk=30))

    assert event["type"] == "dead"
    assert event["reason"] == "book_below_min_names"
    assert event["held_names"] < 30


# Every other `fit_one_bar` test returns before the model is reached — an unknown ordinal
# raises and a thin book is dead, both short of `one_step_var`. This is the only test that
# runs the desk's actual fit, so it is the only one that would notice the live path losing
# its grip on the model. Marked slow because that costs one genuine fit.
@pytest.mark.slow
def test_a_fitted_bar_is_a_complete_serving_event(prices, calm):
    spec = SessionSpec(max_bars=2)
    event = fit_one_bar(calm, 1, prices=prices, spec=spec)

    assert event["type"] == "reassess"
    assert event["var"] > 0
    assert event["es"] >= event["var"]  # ES averages the tail behind the same quantile
    assert event["compute_seconds"] > 0

    # The payload contract the desk reads. A field lost here is a blank panel, not a crash,
    # so absence is asserted rather than left to the frontend to discover.
    assert set(event["dcc"]) == {"a", "b", "nu_marginal_avg"}
    assert len(event["corr"]) == len(UNIVERSE)
    assert len(event["sigma_forecast"]) == len(UNIVERSE)
    assert set(event["marketPrices"]) == set(UNIVERSE)
    assert event["held_names"] >= 1


@pytest.mark.slow
def test_the_same_seed_refits_the_same_bar(prices, calm):
    spec = SessionSpec(max_bars=2)
    first = fit_one_bar(calm, 1, prices=prices, spec=spec)
    again = fit_one_bar(calm, 1, prices=prices, spec=spec)

    # Timing is wall-clock and never repeats; everything the model produced must.
    del first["compute_seconds"], again["compute_seconds"]
    assert first == again


def test_spec_reseeding_leaves_the_rest_of_the_dial_alone():
    spec = SessionSpec(orders_lambda=3.0, max_bars=4)
    reseeded = spec.with_seed(99)

    assert reseeded.seed == 99
    assert (reseeded.orders_lambda, reseeded.max_bars) == (3.0, 4)


# --- the servability gate --------------------------------------------------------


def var_result(**overrides) -> VarResult:
    base = dict(
        var=100.0,
        converged=True,
        degraded=False,
        dcc_params={"a": 0.03, "b": 0.95, "nu_marginal_avg": 7.0},
        corr_spotlight=[[1.0]],
        es=140.0,
        corr_full=[[1.0]],
        sigma_forecast=[0.01],
    )
    base.update(overrides)
    return VarResult(**base)


@pytest.mark.parametrize(
    "field, value",
    [
        ("var", float("nan")),
        ("es", float("inf")),
        ("corr_spotlight", [[float("nan")]]),
        ("corr_full", [[float("nan")]]),
        # A NaN forecast variance makes the covariance singular, mc_var returns a zero
        # VaR, and zero is finite — so without this check the bar would ship as a silent
        # zero-risk reading.
        ("sigma_forecast", [float("nan")]),
    ],
)
def test_a_non_finite_reassessment_is_never_servable(field, value):
    from dccmgarch.live.fits import is_servable

    assert not is_servable(var_result(**{field: value}))


def test_a_well_posed_reassessment_is_servable():
    from dccmgarch.live.fits import is_servable

    assert is_servable(var_result())


# --- the transport's validation --------------------------------------------------


def test_pacing_overrides_are_range_checked():
    from dccmgarch.serving.live_server import BadRequest, parse_session_spec

    assert parse_session_spec("seed=5&orders_lambda=3.5").orders_lambda == 3.5
    with pytest.raises(BadRequest):
        parse_session_spec("orders_lambda=999")
    with pytest.raises(BadRequest):
        parse_session_spec("seed=nope")
    # Past 1.0 the arrival slots overlap and the tape stops being ordered.
    with pytest.raises(BadRequest):
        parse_session_spec("order_jitter=1.5")


def test_an_absent_seed_is_fresh_per_session():
    from dccmgarch.serving.live_server import parse_session_spec

    assert parse_session_spec("").seed != parse_session_spec("").seed


def test_unknown_query_parameters_are_ignored():
    from dccmgarch.serving.live_server import parse_session_spec

    assert parse_session_spec("seed=5&nonsense=1").seed == 5


def test_notional_lists_are_parsed_and_bounded():
    from dccmgarch.serving.live_server import BadRequest, parse_session_spec

    assert parse_session_spec("order_notionals=1000,2000").order_notionals == (1000.0, 2000.0)
    with pytest.raises(BadRequest):
        parse_session_spec("order_notionals=1")  # below the sanity floor
    with pytest.raises(BadRequest):
        parse_session_spec("order_notionals=,")  # separators but no numbers


def test_the_opening_fit_override_is_optional_and_validated():
    from dccmgarch.serving.live_server import BadRequest, parse_book_ts

    assert parse_book_ts("") is None
    assert parse_book_ts("book_ts=42.5") == 42.5
    with pytest.raises(BadRequest):
        parse_book_ts("book_ts=nope")
