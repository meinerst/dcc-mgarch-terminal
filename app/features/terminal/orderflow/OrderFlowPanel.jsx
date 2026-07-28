"use client";
// The raw tape: which name, which side, what size, as each order lands.
import { useEffect, useRef } from "react";
import { Panel } from "../ui/Panel";
import { marketClock, money, signedShares } from "../ui/format";

// How close to the bottom still counts as "following the tape", in pixels.
const STICK_THRESHOLD = 24;

export function OrderFlowPanel({ ticker }) {
  // The feed arrives newest-first; render oldest to newest so the newest sits at the
  // bottom and older orders scroll off the top.
  const rows = [...ticker].reverse();
  const scrollRef = useRef(null);
  // Follow the latest by default, stop following once the viewer scrolls up to inspect,
  // resume when they scroll back down.
  const followingRef = useRef(true);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && followingRef.current) element.scrollTop = element.scrollHeight;
  }, [ticker.length]);

  function onScroll(event) {
    const element = event.currentTarget;
    followingRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD;
  }

  return (
    <Panel title="Order Flow" note="simulated orders · real 5-min prices">
      <div className="order-head">
        <span>TIME</span>
        <span>TICKER</span>
        <span className="r">SHARES</span>
        <span className="r">PRICE</span>
      </div>
      <div className="order-ticker" ref={scrollRef} onScroll={onScroll}>
        {rows.length === 0 && <div className="terminal-panel-note">awaiting orders…</div>}
        {rows.map((order, i) => (
          <div className="order-row" key={`${order.market_ts}-${i}`}>
            <span className="t">{marketClock(order.clock)}</span>
            <span className={order.shares >= 0 ? "side-buy" : "side-sell"}>
              {order.shares >= 0 ? "BUY " : "SELL"} {order.asset}
            </span>
            <span className={`shares ${order.shares >= 0 ? "positive" : "negative"}`}>
              {signedShares(order.shares)}
            </span>
            <span className="price">{money(order.fillPrice, 2)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
