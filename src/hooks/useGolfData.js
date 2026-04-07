import { useState, useEffect, useCallback, useRef } from 'react';

const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';
const POLL_INTERVAL = 60_000;
const CACHE_KEY = 'masters-golf-data-cache';

/**
 * Parse ESPN scoreboard into a map of golfer name -> { score, status, thru, position, round }
 */
function parseESPN(data) {
  const golfers = {};
  let tournamentName = '';
  let tournamentStatus = '';
  let roundDisplay = '';
  let isComplete = false;

  try {
    const event = data?.events?.[0];
    if (!event) return { golfers, tournamentName, tournamentStatus, roundDisplay, isComplete };

    tournamentName = event.name || 'PGA Tournament';
    const competition = event.competitions?.[0];
    const statusType = competition?.status?.type || {};
    tournamentStatus = statusType.description || '';
    roundDisplay = statusType.shortDetail || '';
    isComplete = statusType.completed === true ||
      statusType.name === 'STATUS_FINAL' ||
      tournamentStatus.toLowerCase().includes('final');

    const competitors = competition?.competitors || [];
    for (const c of competitors) {
      const athlete = c.athlete || {};
      const fullName = athlete.displayName || '';
      if (!fullName) continue;

      const scoreStr = c.score?.displayValue || c.statistics?.[0]?.displayValue || 'E';
      let score = 0;
      if (scoreStr === 'E' || scoreStr === '-') {
        score = 0;
      } else {
        score = parseInt(scoreStr, 10);
        if (isNaN(score)) score = 0;
      }

      let status = 'active';
      const playerStatus = c.status?.type?.name || c.status?.displayValue || '';
      if (playerStatus === 'cut' || playerStatus === 'CUT' ||
          c.linescores?.some(l => l?.displayValue === 'CUT')) {
        status = 'cut';
      } else if (playerStatus === 'wd' || playerStatus === 'WD') {
        status = 'wd';
      }

      const thru = c.status?.displayValue || c.status?.thru?.toString() || '';
      const position = c.status?.position?.displayName || c.sortOrder?.toString() || '';
      const currentRound = c.status?.period || '';

      golfers[fullName] = { score, status, thru, position, currentRound };

      // Secondary last-name key for matching
      const parts = fullName.split(' ');
      if (parts.length >= 2) {
        const lastName = parts[parts.length - 1];
        if (!golfers[lastName]) {
          golfers[lastName] = golfers[fullName];
        }
      }
    }
  } catch (err) {
    console.error('ESPN parse error:', err);
  }

  return { golfers, tournamentName, tournamentStatus, roundDisplay, isComplete };
}

/**
 * Fuzzy match a pick name to ESPN golfer data.
 */
export function matchGolfer(pickName, golferMap) {
  if (!pickName || !golferMap) return null;

  const cleaned = pickName.replace(/\s*\(.*?\)\s*$/, '').trim();

  // Exact
  if (golferMap[cleaned]) return { name: cleaned, ...golferMap[cleaned] };

  // Case insensitive
  const lower = cleaned.toLowerCase();
  for (const [key, val] of Object.entries(golferMap)) {
    if (key.toLowerCase() === lower) return { name: key, ...val };
  }

  // Partial match
  for (const [key, val] of Object.entries(golferMap)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) {
      return { name: key, ...val };
    }
  }

  // Last name + first initial
  const pickParts = cleaned.split(' ');
  const pickLast = pickParts[pickParts.length - 1].toLowerCase();
  for (const [key, val] of Object.entries(golferMap)) {
    const keyParts = key.split(' ');
    const keyLast = keyParts[keyParts.length - 1].toLowerCase();
    if (keyLast === pickLast) {
      if (pickParts.length > 1 && keyParts.length > 1) {
        if (pickParts[0][0].toLowerCase() === keyParts[0][0].toLowerCase()) {
          return { name: key, ...val };
        }
      }
      return { name: key, ...val };
    }
  }

  return null;
}

export function useGolfData() {
  const [golferData, setGolferData] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.golfers || {};
      }
    } catch { /* ignore */ }
    return {};
  });

  const [tournamentInfo, setTournamentInfo] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          name: parsed.tournamentName || '2026 Masters Tournament',
          status: parsed.tournamentStatus || '',
          round: parsed.roundDisplay || '',
          isComplete: parsed.isComplete || false,
        };
      }
    } catch { /* ignore */ }
    return { name: '2026 Masters Tournament', status: '', round: '', isComplete: false };
  });

  const [lastUpdate, setLastUpdate] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.lastUpdate ? new Date(parsed.lastUpdate) : null;
      }
    } catch { /* ignore */ }
    return null;
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(ESPN_URL);
      if (!res.ok) throw new Error(`ESPN API ${res.status}`);
      const json = await res.json();
      const { golfers, tournamentName, tournamentStatus, roundDisplay, isComplete } = parseESPN(json);

      // Only update if we got data
      if (Object.keys(golfers).length > 0) {
        setGolferData(golfers);
        const info = { name: tournamentName, status: tournamentStatus, round: roundDisplay, isComplete };
        setTournamentInfo(info);
        const now = new Date();
        setLastUpdate(now);

        // Cache to localStorage so data persists after tournament
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          golfers,
          tournamentName,
          tournamentStatus,
          roundDisplay,
          isComplete,
          lastUpdate: now.toISOString(),
        }));
      }
      setError(null);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
      // On error, keep using cached data — don't clear
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetchData]);

  const golferNames = Object.keys(golferData).filter(name => name.includes(' '));

  return { golferData, golferNames, tournamentInfo, lastUpdate, isLoading, error, refetch: fetchData };
}
