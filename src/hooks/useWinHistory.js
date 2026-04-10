import { useState, useEffect, useRef } from 'react';
import { BACKFILL_HISTORY } from '../data/backfillHistory';

const SNAP_INTERVAL = 60_000; // snapshot every 60s

/**
 * Combines hardcoded end-of-day history with live-computed snapshots.
 * Each device computes its own live snapshots from scored entries.
 * Hardcoded data is deployed manually each evening at ~8pm CST.
 */
export function useWinHistory(scoredEntries) {
  const [liveSnaps, setLiveSnaps] = useState([]);
  const lastSnapRef = useRef(null);

  useEffect(() => {
    if (!scoredEntries?.length) return;

    function takeSnapshot() {
      const snap = { t: Date.now(), s: {} };
      for (const entry of scoredEntries) {
        snap.s[entry.id] = entry.best4Total ?? 0;
      }

      // Only append if scores changed from last snapshot
      const last = lastSnapRef.current;
      const changed = !last || Object.keys(snap.s).some(id => snap.s[id] !== last.s[id]);
      if (changed) {
        lastSnapRef.current = snap;
        setLiveSnaps(prev => [...prev, snap]);
      }
    }

    // Take one immediately
    takeSnapshot();

    // Then every SNAP_INTERVAL
    const timer = setInterval(takeSnapshot, SNAP_INTERVAL);
    return () => clearInterval(timer);
  }, [scoredEntries]);

  // Combine hardcoded history + live snapshots
  // Filter out any live snaps that overlap with backfill time range
  const backfillEnd = BACKFILL_HISTORY.length > 0
    ? BACKFILL_HISTORY[BACKFILL_HISTORY.length - 1].t
    : 0;
  const freshLive = liveSnaps.filter(s => s.t > backfillEnd);

  return [...BACKFILL_HISTORY, ...freshLive];
}
