// The desk's book: position accounting, and the snapshot every panel reads.
//
// Both playback engines drive this one book, so a recorded session and a live one cannot
// disagree about P&L or exposure. The engines differ only in their scheduler and clocks.
//
// Inventory is average-cost: a running entry price plus cumulative realized P&L, which is
// enough to split realized / inventory / total. FIFO lot matching would be more faithful
// but carries per-lot state an illustrative desk does not need — a deliberate simplification.

import { eulerRiskSplit, portfolioSigmaDollars } from "./riskDecomposition";

// Half the simulated bid-ask spread, as a fraction of the mid. Restored from the original
// 2022 app, which exposed a bid-ask input defaulting to 0.1% and halved it. The desk
// QUOTES both sides: a buy fills at P*(1-h) and a sell at P*(1+h), so every fill books the
// half-spread as income whichever way it goes.
//
// Inventory is still carried at the MID, exactly as the original did, so spread income is
// purely additive: realized and inventory P&L are untouched by it.
const HALF_SPREAD = 0.0005;

const TICKER_FEED_LIMIT = 40;
const HISTORY_LIMIT = 24;

export function createDesk({
  spotlightAssets,
  minNamesForRisk = 3,
  replayFactor = 25,
  secPerBar = null,
  cpu = null,
  session = null,
  subset = null,
}) {
  const positions = {}; // ticker -> { shares, marketPrice, inventoryPrice, realized, spreadPnl }
  const marketPrices = {};
  const tickerFeed = []; // newest first
  const history = []; // { index, marketTs, kind, seconds } — newest first
  const dccSeries = []; // { a, b, marketTs } per landed fit — oldest first
  // { varPerK, esPerK, marketTs } per landed fit — risk per $1,000 of gross exposure.
  // Headline VaR mostly tracks how big the book has become; dividing it out leaves what
  // the MODEL did, which is the only line on the desk that moves for that reason alone.
  const riskSeries = [];
  let latest = null; // the last LANDED reassessment
  let landedCount = 0;
  // The landed fit's quantile multiplier: VaR and ES per dollar of portfolio sigma, plus
  // the market stamp of the forecast they came from. See `revalue`.
  let quantile = null;

  // The desk shows the book that EXISTS, not the tradable universe: a name enters on its
  // first fill and never leaves, because a flattened position still carries realized P&L
  // the totals sum over. The array identity is stable between entries, so the correlation
  // panel's memo only re-renders when the book actually grows.
  let activeAssets = [];

  function applyOrder(order) {
    if (!positions[order.asset]) {
      if (!spotlightAssets.includes(order.asset)) return; // outside the payload universe
      positions[order.asset] = {
        shares: 0, marketPrice: null, inventoryPrice: 0, realized: 0, spreadPnl: 0,
      };
      // Preserve the payload's universe order so the matrix axes stay canonical.
      activeAssets = spotlightAssets.filter((a) => positions[a]);
    }
    bookTrade(positions[order.asset], order.shares, order.fillPrice);
    // Spread income sits OUTSIDE bookTrade so inventory accounting stays one concern: it
    // is a function of traded notional alone, not of the position it lands on.
    positions[order.asset].spreadPnl += HALF_SPREAD * Math.abs(order.shares * order.fillPrice);
    marketPrices[order.asset] = order.fillPrice;
    tickerFeed.unshift(order);
    if (tickerFeed.length > TICKER_FEED_LIMIT) tickerFeed.pop();
  }

  // Signed shares, average entry price and realized P&L for one fill. Handles opening,
  // adding, reducing and flipping through zero. A long profits when the exit is above the
  // entry and a short when it is below; the sign works out through
  // `realized += -delta * (fillPrice - inventoryPrice)`.
  function bookTrade(position, delta, fillPrice) {
    const opening = position.shares === 0 || Math.sign(delta) === Math.sign(position.shares);
    if (opening) {
      const heldGross = Math.abs(position.shares);
      const addedGross = Math.abs(delta);
      position.inventoryPrice =
        (heldGross * position.inventoryPrice + addedGross * fillPrice) / (heldGross + addedGross);
      position.shares += delta;
    } else if (Math.abs(delta) <= Math.abs(position.shares)) {
      // Reducing or closing out: realize P&L on the closed shares, entry price unchanged.
      position.realized += -delta * (fillPrice - position.inventoryPrice);
      position.shares += delta;
      if (position.shares === 0) position.inventoryPrice = 0;
    } else {
      // Flipping: close the whole old position, then open the remainder at this fill.
      position.realized += position.shares * (fillPrice - position.inventoryPrice);
      position.shares += delta;
      position.inventoryPrice = fillPrice;
    }
    position.marketPrice = fillPrice;
  }

  // The bars the model actually ACTED on: completed fits, plus the dead and aborted states
  // where a book below the display floor stopped it. Skipped bars are deliberately absent —
  // dropping a stale bar is the scheduler working as designed, not an event worth reporting.
  function pushHistory(index, marketTs, kind, seconds) {
    history.unshift({ index, marketTs, kind, seconds: seconds ?? null });
    if (history.length > HISTORY_LIMIT) history.pop();
  }

  // `bookGross` is the gross exposure of the book the fit was PRICED on, captured by the
  // engine when the bar arrived — not the book at landing. A fit lands 8-30 s of compute
  // later, and during the opening ramp that is enough new fills to inflate the denominator
  // 20-30%: dividing by it would draw risk-per-dollar FALLING through exactly the stretch
  // where the crash exhibit shows it rising. The numerator and denominator have to describe
  // the same portfolio or the ratio is an artefact of the clock.
  //
  // `bookExposures` is the same instant's SIGNED exposure vector, and it is what makes the
  // between-fit revalue possible: dividing the fit's own VaR by the portfolio sigma of the
  // book it priced backs out the model's quantile multiplier. See `revalue`.
  function landReassess(event, bookGross = null, bookExposures = null) {
    latest = event;
    quantile = backOutQuantile(event, bookExposures);
    if (event.marketPrices) {
      for (const asset of spotlightAssets) {
        if (event.marketPrices[asset] == null) continue;
        marketPrices[asset] = event.marketPrices[asset];
        if (positions[asset]) positions[asset].marketPrice = event.marketPrices[asset];
      }
    }
    // Only landed fits contribute a point: a dead or aborted bar produced no parameters,
    // so it leaves a gap rather than a fabricated value. The market stamp rides along
    // because landed fits are not evenly spaced, so a point's age cannot be inferred from
    // its position in the array.
    if (event.dcc) {
      dccSeries.push({ a: event.dcc.a, b: event.dcc.b, marketTs: event.market_ts ?? null });
    }
    // Same rule as the parameter series: a point exists only where a real one was measured.
    // A fit whose book gross the engine could not supply contributes nothing rather than a
    // point divided by the wrong number.
    if (bookGross > 0 && event.var != null) {
      riskSeries.push({
        varPerK: (event.var / bookGross) * 1000,
        esPerK: event.es != null ? (event.es / bookGross) * 1000 : null,
        marketTs: event.market_ts ?? null,
      });
    }
    landedCount++;
  }

  // BETWEEN FITS: revalue, never re-forecast.
  //
  // A reassessment costs 8-30 real seconds; a bar arrives every 12. The tape keeps filling
  // throughout, so for most of the run the displayed VaR was priced on a book that no
  // longer exists — and the compute clock's idle stretches are exactly where nothing could
  // be done about it, because there is no room for a second fit.
  //
  // What CAN be done costs microseconds. VaR is homogeneous of degree 1 in the exposures
  // under this desk's zero-drift draw, and VaR = k * sigma_p holds up to the marginals'
  // non-ellipticity (see riskDecomposition.js), so dividing a landed VaR by
  // the portfolio sigma of the book it was priced on recovers the model's own quantile
  // multiplier `k`. Multiplying `k` by the LIVE book's sigma reprices that forecast onto
  // the current positions.
  //
  // This is a REVALUE, not a reassessment: sigma and the correlation matrix stay frozen at
  // the last fit, so nothing here forecasts anything and no wall-time is claimed for it.
  // The forecast's age travels with the number so the desk can say so — and that age is
  // itself the crash-vs-calm contrast, since a slower model is a staler forecast.
  function backOutQuantile(event, bookExposures) {
    if (!bookExposures || event.var == null) return null;
    const sigmaDollars = portfolioSigmaDollars({
      universe: spotlightAssets,
      exposures: bookExposures,
      sigma: event.sigma_forecast,
      corr: event.corr,
    });
    if (sigmaDollars == null) return null;
    return {
      varPerSigma: event.var / sigmaDollars,
      esPerSigma: event.es != null ? event.es / sigmaDollars : null,
      marketTs: event.market_ts ?? null,
    };
  }

  // The revalued headline, or the landed figures unchanged when the book's sigma cannot be
  // formed (a flat book, or a fit that arrived without a covariance). Falling back to the
  // landed numbers is the honest degradation: they are what the model actually said.
  function revalue(exposures, marketElapsed) {
    const landed = { var: latest?.var ?? null, es: latest?.es ?? null, revalued: false, ageSeconds: null };
    if (quantile == null) return landed;

    const sigmaDollars = portfolioSigmaDollars({
      universe: spotlightAssets,
      exposures,
      sigma: latest.sigma_forecast,
      corr: latest.corr,
    });
    if (sigmaDollars == null) return landed;

    const ageSeconds =
      marketElapsed != null && quantile.marketTs != null
        ? Math.max(0, marketElapsed - quantile.marketTs)
        : null;
    return {
      var: quantile.varPerSigma * sigmaDollars,
      es: quantile.esPerSigma != null ? quantile.esPerSigma * sigmaDollars : null,
      revalued: true,
      ageSeconds,
    };
  }

  function positionRow(asset) {
    const position = positions[asset];
    const marketPrice = position.marketPrice ?? marketPrices[asset] ?? null;
    const exposure = marketPrice != null ? position.shares * marketPrice : 0;
    const unrealized =
      marketPrice != null ? position.shares * (marketPrice - position.inventoryPrice) : 0;
    // Spread income is riskless and monotonically increasing — earned at the moment of the
    // fill and never given back. It therefore lifts total P&L even while inventory bleeds,
    // which is the market maker's actual position and worth seeing as its own line.
    return {
      ticker: asset,
      shares: position.shares,
      marketPrice,
      inventoryPrice: position.shares !== 0 ? position.inventoryPrice : null,
      exposure,
      realized: position.realized,
      unrealized,
      spreadPnl: position.spreadPnl,
      totalPnl: position.realized + unrealized + position.spreadPnl,
    };
  }

  // The risk split runs on the LIVE book against the LAST LANDED covariance, and is handed
  // the REVALUED total so the components sum to the headline the cards show. Both numbers
  // then carry the same single staleness — the forecast's age — instead of mixing live
  // exposures into a total priced on a book that has since moved.
  function applyRiskSplit(rows, portfolioVar) {
    for (const row of rows) {
      row.componentVar = null;
      row.divEffect = null;
    }
    // Indexed by the PAYLOAD UNIVERSE, never the held subset: reindexing the correlation
    // matrix by the book would silently read the wrong pair's correlation.
    const byTicker = new Map(rows.map((row) => [row.ticker, row]));
    const split = eulerRiskSplit({
      universe: spotlightAssets,
      exposures: spotlightAssets.map((asset) => byTicker.get(asset)?.exposure ?? 0),
      sigma: latest?.sigma_forecast,
      corr: latest?.corr,
      portfolioVar,
    });
    if (!split) return;

    spotlightAssets.forEach((asset, i) => {
      const row = byTicker.get(asset);
      if (!row) return;
      row.componentVar = split.componentVar[i];
      row.divEffect = split.divEffect[i];
    });
  }

  // The state object every panel consumes. The engine supplies the clock and compute
  // fields — the only things that differ between a recording and a live run; everything
  // book-derived is computed here.
  function snapshot({ marketSeconds, marketElapsed = null, realSeconds, compute, done }) {
    const rows = activeAssets.map(positionRow);
    // Longs and shorts ADD for gross (both consume risk budget) and net out for net, which
    // is what names the book's lean.
    const grossExposure = rows.reduce((sum, row) => sum + Math.abs(row.exposure), 0);
    for (const row of rows) {
      row.weight = grossExposure > 0 ? Math.abs(row.exposure) / grossExposure : 0;
    }
    const risk = revalue(exposureVector(rows), marketElapsed);
    applyRiskSplit(rows, risk.var);

    return {
      spotlightAssets, // the full payload universe — indexes the N x N correlation matrix
      activeAssets, // the names the book has traded — every panel's display axis
      replayFactor,
      secPerBar,
      cpu, // the chip the compute clock's wall-time was measured on
      minNamesForRisk,
      session,
      subset,
      marketSeconds,
      realSeconds,
      rows,
      grossExposure,
      netExposure: rows.reduce((sum, row) => sum + row.exposure, 0),
      totalPnl: rows.reduce((sum, row) => sum + row.totalPnl, 0),
      ticker: tickerFeed.slice(),
      compute,
      // The headline risk: the last landed forecast, revalued onto the book as it stands
      // this frame. `revalued` and `ageSeconds` are what let the cards say so.
      risk,
      history: history.slice(),
      dccSeries: dccSeries.slice(),
      riskSeries: riskSeries.slice(),
      latest,
      latestIndex: landedCount - 1, // -1 before the first fit lands; feeds panel memoisation
      // Risk panels gate on the LANDED snapshot, never on live positions: that is what
      // prevents a half-formed display while the book is still filling.
      riskLive: latest != null && (latest.held_names ?? 0) >= minNamesForRisk,
      done,
    };
  }

  function heldNamesCount() {
    return activeAssets.filter((asset) => positions[asset].shares !== 0).length;
  }

  // Signed dollar exposure per PAYLOAD UNIVERSE entry — the indexing the covariance uses,
  // so a name the book has not traded contributes a zero rather than shifting the axis.
  function exposureVector(rows) {
    const byTicker = new Map(rows.map((row) => [row.ticker, row.exposure]));
    return spotlightAssets.map((asset) => byTicker.get(asset) ?? 0);
  }

  // The book as it stands right now, in both shapes the engines need. They read this when a
  // bar ARRIVES — the instant whose book that bar's fit is priced on — and hand it back at
  // landing: the gross for the per-$1k series, the vector for the revalue's quantile.
  function exposuresNow() {
    return exposureVector(activeAssets.map(positionRow));
  }

  function grossExposureNow() {
    return exposuresNow().reduce((sum, exposure) => sum + Math.abs(exposure), 0);
  }

  return {
    applyOrder,
    pushHistory,
    landReassess,
    snapshot,
    heldNamesCount,
    grossExposureNow,
    exposuresNow,
    get latest() { return latest; },
    get landedCount() { return landedCount; },
  };
}
