import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Reveal streamed stage events at a readable cadence.
 *
 * WHAT IS AND IS NOT BEING PACED. The pipeline is not slowed down: the server
 * runs at full speed and the durations displayed are the real measured ones.
 * What is paced is the *rendering* of events that have already arrived, so a
 * pipeline finishing in 350ms does not flash five stages past in a third of a
 * second and show the reader nothing.
 *
 * This only ever adds time when the server is faster than the eye. If a stage
 * genuinely takes two seconds, its event arrives after the queue has already
 * drained and appears immediately — the pacing costs nothing and the interface
 * shows the real two-second wait.
 *
 * The alternative designs were both worse. Sleeping in the backend would make
 * the API dishonestly slow for every caller, not just the browser. Animating
 * on a fixed timer without real events would show the same three seconds
 * whatever actually happened, which is the thing this whole feature exists to
 * avoid.
 */

/**
 * Minimum gap between two revealed events. Ten events (five stages, each
 * running then completed) put the floor at roughly 1.6 seconds — long enough
 * to follow, short enough that nobody is waiting on it.
 */
const DEFAULT_INTERVAL_MS = 160;

export default function usePacedStages(intervalMs = DEFAULT_INTERVAL_MS) {
  // Everything received, in arrival order.
  const pending = useRef([]);
  // How many of those have been shown.
  const [revealedCount, setRevealedCount] = useState(0);
  const [received, setReceived] = useState([]);
  const timer = useRef(null);

  const reset = useCallback(() => {
    pending.current = [];
    setReceived([]);
    setRevealedCount(0);
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const push = useCallback((event) => {
    pending.current = [...pending.current, event];
    setReceived(pending.current);
  }, []);

  // Release one event per interval until the queue is empty.
  useEffect(() => {
    if (revealedCount >= received.length) return undefined;
    timer.current = window.setTimeout(
      () => setRevealedCount((count) => Math.min(count + 1, pending.current.length)),
      // The very first event appears at once; there is nothing to read yet, and
      // waiting would just delay the feed's arrival on screen.
      revealedCount === 0 ? 0 : intervalMs,
    );
    return () => window.clearTimeout(timer.current);
  }, [revealedCount, received.length, intervalMs]);

  const displayed = received.slice(0, revealedCount);

  // Keyed by stage, so a "running" entry is replaced by its "completed"
  // counterpart rather than the feed listing the same work twice.
  const stageMap = {};
  displayed.forEach((event) => { stageMap[event.stage] = event; });

  return {
    stages: stageMap,
    /** True while events are still waiting to be shown. */
    draining: revealedCount < received.length,
    /** True once at least one event has been displayed. */
    started: revealedCount > 0,
    push,
    reset,
  };
}
