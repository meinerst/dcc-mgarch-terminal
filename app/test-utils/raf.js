// Deterministic requestAnimationFrame driver for the playback engines.
//
// Both engines advance their clocks from the timestamp rAF hands them, so a fake rAF
// with a fake timeline makes the whole scheduler testable without waiting real seconds.
// Frames are stepped explicitly, never on a timer, so tests are not timing-sensitive.

export function installRaf() {
  const pending = new Map();
  let nextId = 0;
  let nowMs = 0;

  const realRaf = globalThis.requestAnimationFrame;
  const realCaf = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (cb) => {
    nextId += 1;
    pending.set(nextId, cb);
    return nextId;
  };
  globalThis.cancelAnimationFrame = (id) => {
    pending.delete(id);
  };

  return {
    /**
     * Run `seconds` of frames at `stepMs` each; awaits microtasks so fetches settle.
     *
     * The engines take their first frame as the clock origin (`lastTs == null`), so the
     * elapsed time an engine sees is one step short of `seconds`. Keep the step small
     * enough that the difference stays under test tolerances.
     */
    async advance(seconds, stepMs = 20) {
      const frames = Math.max(1, Math.round((seconds * 1000) / stepMs));
      for (let i = 0; i < frames; i++) {
        nowMs += stepMs;
        const due = [...pending.entries()];
        pending.clear();
        for (const [, cb] of due) cb(nowMs);
        await Promise.resolve();
        await Promise.resolve();
      }
    },
    get frameCount() {
      return pending.size;
    },
    restore() {
      globalThis.requestAnimationFrame = realRaf;
      globalThis.cancelAnimationFrame = realCaf;
    },
  };
}
