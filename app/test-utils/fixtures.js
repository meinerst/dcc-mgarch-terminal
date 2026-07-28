// One definition of the desk row the book hands the panels.
//
// Two panels render the same row shape from different angles (positions and the VaR
// decomposition), so the shape lives once here rather than as two copies that can drift
// apart and quietly stop testing the same contract.

export function positionRow(overrides = {}) {
  return {
    ticker: "AAPL",
    shares: 100,
    marketPrice: 50,
    inventoryPrice: 48,
    exposure: 5000,
    realized: 100,
    unrealized: 200,
    spreadPnl: 5,
    totalPnl: 305,
    weight: 0.5,
    componentVar: 400,
    divEffect: 0.6,
    ...overrides,
  };
}
