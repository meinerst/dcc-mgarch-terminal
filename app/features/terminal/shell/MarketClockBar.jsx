"use client";
// The market clock and the run's single transport control.
//
// That control is never a dead end: before the run it is START, during it PAUSE/PLAY, and
// once the session is over RESTART — because dismissing the end-of-run modal used to leave
// a page refresh as the only way back. The ⓘ is permanent, so however the onboarding gate
// was left, the explainer stays reachable.
import { marketClock } from "../ui/format";

export function MarketClockBar({
  marketSeconds, replayFactor, degraded, paused, onTogglePause, done, onRestart,
  started = true, onStart, onOpenExplainer,
}) {
  return (
    <div className="terminal-clock-bar">
      <div className="market-clock">
        <span className={`traffic-light ${degraded || paused || !started ? "amber" : "green"}`} />
        <span>MARKET {marketClock(marketSeconds)}</span>
        <span
          className="replay-badge"
          title="Market clock only: the 5-min bar replay runs at this multiple of real time. The compute clock is never accelerated."
        >
          ⏩ {replayFactor}x
        </span>

        {!started ? (
          <button className="playback-toggle play" onClick={onStart} aria-label="Start">
            ▶ START
          </button>
        ) : done ? (
          <button className="playback-toggle restart" onClick={onRestart} aria-label="Restart">
            ↻ RESTART
          </button>
        ) : (
          <button
            className={`playback-toggle ${paused ? "play" : "pause"}`}
            onClick={onTogglePause}
            aria-label={paused ? "Play" : "Pause"}
          >
            {paused ? "▶ PLAY" : "⏸ PAUSE"}
          </button>
        )}

        {onOpenExplainer && (
          <button
            className="explainer-open"
            onClick={onOpenExplainer}
            aria-label="What am I looking at?"
            title="What am I looking at?"
          >
            ⓘ
          </button>
        )}
      </div>
    </div>
  );
}
