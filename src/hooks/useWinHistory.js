import { BACKFILL_HISTORY } from '../data/backfillHistory';

// Clean up old localStorage keys — no longer needed
try {
  localStorage.removeItem('masters-win-history');
  localStorage.removeItem('masters-win-history-v2');
  localStorage.removeItem('masters-win-history-v3');
  localStorage.removeItem('masters-win-history-backfilled-v2');
  localStorage.removeItem('masters-win-history-backfilled-v3');
  localStorage.removeItem('masters-win-history-backfilled-v4');
} catch {}

// Single source of truth: hardcoded data from GitHub Actions (updated every minute).
// All devices see identical history — no per-device localStorage divergence.
export function useWinHistory() {
  return BACKFILL_HISTORY;
}
