import { useState, useEffect, useCallback, useRef } from 'react';

// The Odds API key — hardcoded for deployment. 500 req/month free tier.
const API_KEY = 'c38b243a9594e20d3a10f5a42481a489';
const ODDS_CACHE_KEY = 'masters-odds-cache';
const ODDS_TIMESTAMP_KEY = 'masters-odds-last-fetch';

// Only fetch 7am–10pm CST, hourly. Tournament runs Thu 4/10 – Sun 4/13.
// Budget: ~16 fetches/day * 4 days = ~64 requests. Well within 500.
const HOUR_MS = 3_600_000;
const CHECK_INTERVAL = 60_000; // Check every minute if it's time to fetch

/**
 * Should we fetch right now?
 * - Only between 7am and 10pm CST (UTC-5 during CDT / UTC-6 during CST — April is CDT so UTC-5)
 * - Only if last fetch was >1 hour ago
 */
function shouldFetchNow() {
  const now = new Date();
  // Convert to CST/CDT: April is CDT = UTC-5
  const cstHour = (now.getUTCHours() - 5 + 24) % 24;
  if (cstHour < 7 || cstHour >= 22) return false;

  const lastFetch = localStorage.getItem(ODDS_TIMESTAMP_KEY);
  if (lastFetch) {
    const elapsed = now.getTime() - parseInt(lastFetch, 10);
    if (elapsed < HOUR_MS) return false;
  }

  return true;
}

export function useOdds() {
  const [oddsData, setOddsData] = useState(() => {
    try {
      const cached = localStorage.getItem(ODDS_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch { /* ignore */ }
    return {};
  });
  const [oddsError, setOddsError] = useState(null);
  const timerRef = useRef(null);

  const fetchOdds = useCallback(async (force = false) => {
    if (!force && !shouldFetchNow()) return;

    try {
      // Masters outright winner odds, US bookmakers only, American format
      const url = `https://api.the-odds-api.com/v4/sports/golf_masters_tournament_winner/odds` +
        `?regions=us&markets=outrights&oddsFormat=american&bookmakers=draftkings,fanduel,betmgm,caesars_sportsbook,pointsbet_us` +
        `&apiKey=${API_KEY}`;

      const res = await fetch(url);
      if (!res.ok) {
        // Check remaining requests
        const remaining = res.headers.get('x-requests-remaining');
        console.warn(`Odds API: ${res.status}, remaining: ${remaining}`);
        throw new Error(`Odds API ${res.status}`);
      }

      const remaining = res.headers.get('x-requests-remaining');
      console.log(`Odds API: OK, requests remaining: ${remaining}`);

      const json = await res.json();
      if (!json || json.length === 0) return;

      // Parse: best odds across US bookmakers for each golfer
      const oddsMap = {};
      for (const event of json) {
        for (const bookmaker of event.bookmakers || []) {
          for (const market of bookmaker.markets || []) {
            if (market.key !== 'outrights') continue;
            for (const outcome of market.outcomes || []) {
              const name = outcome.name;
              const price = outcome.price;
              if (!oddsMap[name]) {
                oddsMap[name] = { prices: [], book: null, bestPrice: -Infinity };
              }
              oddsMap[name].prices.push(price);
              // Track best (highest) American odds
              if (price > oddsMap[name].bestPrice) {
                oddsMap[name].bestPrice = price;
                oddsMap[name].book = bookmaker.title;
              }
            }
          }
        }
      }

      // Build result with consensus (average) odds and implied win probability
      const result = {};
      for (const [name, data] of Object.entries(oddsMap)) {
        const avgPrice = Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length);
        // Implied probability from American odds
        let impliedProb;
        if (avgPrice > 0) {
          impliedProb = 100 / (avgPrice + 100);
        } else {
          impliedProb = Math.abs(avgPrice) / (Math.abs(avgPrice) + 100);
        }
        result[name] = {
          americanOdds: avgPrice > 0 ? `+${avgPrice}` : `${avgPrice}`,
          impliedProb: parseFloat((impliedProb * 100).toFixed(2)),
          bestOdds: data.bestPrice > 0 ? `+${data.bestPrice}` : `${data.bestPrice}`,
          bestBook: data.book,
        };
      }

      setOddsData(result);
      localStorage.setItem(ODDS_CACHE_KEY, JSON.stringify(result));
      localStorage.setItem(ODDS_TIMESTAMP_KEY, Date.now().toString());
      setOddsError(null);
    } catch (err) {
      console.error('Odds fetch error:', err);
      setOddsError(err.message);
      // Keep cached data on error
    }
  }, []);

  useEffect(() => {
    // Initial check
    fetchOdds();
    // Check every minute if it's time to fetch (respects the hourly + 7am-10pm window)
    timerRef.current = setInterval(() => fetchOdds(), CHECK_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetchOdds]);

  return { oddsData, oddsError, refetchOdds: () => fetchOdds(true) };
}

/**
 * Fuzzy match a golfer name to odds data.
 */
export function matchOdds(golferName, oddsData) {
  if (!golferName || !oddsData || Object.keys(oddsData).length === 0) return null;
  const cleaned = golferName.replace(/\s*\(.*?\)$/, '').trim();

  // Exact
  if (oddsData[cleaned]) return oddsData[cleaned];

  // Case insensitive
  const lower = cleaned.toLowerCase();
  for (const [key, val] of Object.entries(oddsData)) {
    if (key.toLowerCase() === lower) return val;
  }

  // Last name + first initial
  const parts = cleaned.split(' ');
  const last = parts[parts.length - 1].toLowerCase();
  for (const [key, val] of Object.entries(oddsData)) {
    const keyParts = key.split(' ');
    if (keyParts[keyParts.length - 1].toLowerCase() === last) {
      if (parts.length > 1 && keyParts.length > 1 &&
          parts[0][0].toLowerCase() === keyParts[0][0].toLowerCase()) {
        return val;
      }
    }
  }

  // Loose last-name-only fallback
  for (const [key, val] of Object.entries(oddsData)) {
    const keyParts = key.split(' ');
    if (keyParts[keyParts.length - 1].toLowerCase() === last) {
      return val;
    }
  }

  return null;
}
