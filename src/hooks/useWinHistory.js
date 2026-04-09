import { useState, useEffect, useRef } from 'react';
import { BACKFILL_HISTORY } from '../data/backfillHistory';

const HISTORY_KEY = 'masters-win-history-v3';
const MAX_SNAPSHOTS = 1000;
const MIN_INTERVAL_MS = 55_000;

// Clean up all old keys
try {
  localStorage.removeItem('masters-win-history');
  localStorage.removeItem('masters-win-history-v2');
  localStorage.removeItem('masters-win-history-backfilled-v2');
  localStorage.removeItem('masters-win-history-backfilled-v3');
  localStorage.removeItem('masters-win-history-backfilled-v4');
} catch {}

function loadHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.length > 0) return parsed;
    }
  } catch {}
  // First load: start with hardcoded backfill
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(BACKFILL_HISTORY));
  } catch {}
  return [...BACKFILL_HISTORY];
}

export function useWinHistory(winProbabilities, scoredEntries) {
  const [history, setHistory] = useState(loadHistory);
  const lastLogRef = useRef(0);

  // Log ongoing snapshots
  useEffect(() => {
    if (!winProbabilities || Object.keys(winProbabilities).length === 0) return;
    if (!scoredEntries || scoredEntries.length === 0) return;

    const now = Date.now();
    if (now - lastLogRef.current < MIN_INTERVAL_MS) return;
    lastLogRef.current = now;

    const snapshot = { t: now, p: {} };
    for (const entry of scoredEntries) {
      snapshot.p[entry.id] = winProbabilities[entry.id] ?? 0;
    }

    const prev = history[history.length - 1];
    if (prev) {
      const same = Object.keys(snapshot.p).every(
        id => Math.abs((prev.p[id] ?? 0) - snapshot.p[id]) < 0.05
      );
      if (same) return;
    }

    setHistory(h => {
      const updated = [...h, snapshot].slice(-MAX_SNAPSHOTS);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      } catch {
        const trimmed = updated.slice(-200);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      }
      return updated;
    });
  }, [winProbabilities, scoredEntries]);

  return history;
}
