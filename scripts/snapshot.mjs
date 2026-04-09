#!/usr/bin/env node
/**
 * snapshot.mjs — Fetch ESPN + Odds API, run Monte Carlo, append win% snapshot.
 *
 * Usage: node scripts/snapshot.mjs
 * Output: appends to scripts/win-history.json
 * Logs to stderr only.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = join(__dirname, 'win-history.json');
const ODDS_CACHE_PATH = join(__dirname, 'odds-cache.json');
const BACKFILL_PATH = join(__dirname, '..', 'src', 'data', 'backfillHistory.js');
const ODDS_CACHE_TTL = 15 * 60 * 1000; // 15 min — saves API quota (500 req/mo)

const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';
const ODDS_URL =
  'https://api.the-odds-api.com/v4/sports/golf_masters_tournament_winner/odds' +
  '?regions=us&markets=outrights&oddsFormat=american' +
  '&bookmakers=draftkings,fanduel,betmgm,caesars_sportsbook,pointsbet_us' +
  '&apiKey=c38b243a9594e20d3a10f5a42481a489';

const NUM_SIMS = 3000;

// ── Entries ──────────────────────────────────────────────────────────────────
const ENTRIES = [
  { id: 'e1', name: 'Collin Lamar', picks: ['Jon Rahm', 'Ludvig Aberg', 'Patrick Reed', 'J.J. Spaun', 'Gary Woodland', 'Max Greyserman'] },
  { id: 'e2', name: 'Bob Bennett', picks: ['Jon Rahm', 'Justin Rose', 'Patrick Reed', 'J.J. Spaun', 'Gary Woodland', 'Nick Taylor'] },
  { id: 'e3', name: 'Clark Foy 1', picks: ['Rory McIlroy', 'Ludvig Aberg', 'Robert MacIntyre', 'Maverick McNealy', 'Gary Woodland', 'Wyndham Clark'] },
  { id: 'e4', name: 'Clark Foy 2', picks: ['Bryson DeChambeau', 'Xander Schauffele', 'Chris Gotterup', 'J.J. Spaun', 'Keegan Bradley', 'Nick Taylor'] },
  { id: 'e5', name: 'Jesse Bennett', picks: ['Jon Rahm', 'Hideki Matsuyama', 'Si Woo Kim', 'Kurt Kitayama', 'Sungjae Im', 'Hao-Tong Li'] },
  { id: 'e6', name: 'T-Money$', picks: ['Rory McIlroy', 'Tommy Fleetwood', 'Sepp Straka', 'J.J. Spaun', 'Daniel Berger', 'Bubba Watson'] },
  { id: 'e7', name: 'Cole Hon', picks: ['Scottie Scheffler', 'Cameron Young', 'Patrick Reed', 'Sam Burns', 'Gary Woodland', 'Ryan Gerard'] },
  { id: 'e8', name: 'Chris Ondo', picks: ['Bryson DeChambeau', 'Brooks Koepka', 'Robert MacIntyre', 'Corey Conners', 'Ben Griffin', 'Brian Harman'] },
  { id: 'e9', name: 'Xander Cribb', picks: ['Scottie Scheffler', 'Xander Schauffele', 'Si Woo Kim', 'Sam Burns', 'Keegan Bradley', 'Bubba Watson'] },
  { id: 'e10', name: 'Justin Eeg', picks: ['Jon Rahm', 'Ludvig Aberg', 'Min Woo Lee', 'J.J. Spaun', 'Ben Griffin', 'Brian Harman'] },
  { id: 'e11', name: 'DJ Pat 1', picks: ['Scottie Scheffler', 'Matt Fitzpatrick', 'Russell Henley', 'Maverick McNealy', 'Harry Hall', 'Nick Taylor'] },
  { id: 'e12', name: 'Raphael Dickie', picks: ['Scottie Scheffler', 'Xander Schauffele', 'Viktor Hovland', 'Corey Conners', 'Sungjae Im', 'Wyndham Clark'] },
  { id: 'e13', name: 'Dan Jackson', picks: ['Rory McIlroy', 'Tommy Fleetwood', 'Si Woo Kim', 'J.J. Spaun', 'Gary Woodland', 'Hao-Tong Li'] },
  { id: 'e14', name: 'Kevin Tan', picks: ['Bryson DeChambeau', 'Xander Schauffele', 'Patrick Reed', 'Corey Conners', 'Daniel Berger', 'Sergio Garcia'] },
  { id: 'e15', name: 'Mike Martinez', picks: ['Scottie Scheffler', 'Ludvig Aberg', 'Viktor Hovland', 'Sam Burns', 'Sungjae Im', 'Brian Harman'] },
  { id: 'e16', name: 'Liam Masek', picks: ['Bryson DeChambeau', 'Xander Schauffele', 'Patrick Reed', 'Matthew McCarty', 'Max Homa', 'Sergio Garcia'] },
  { id: 'e17', name: 'DJ Pat 2', picks: ['Scottie Scheffler', 'Hideki Matsuyama', 'Robert MacIntyre', 'Jacob Bridgeman', 'Alexander Noren', 'Ryan Gerard'] },
];

// ── MC calibration (matches scoring.js exactly) ─────────────────────────────
const SCORE_CAP_LOW = -23;
const SCORE_CAP_HIGH = 29;

function histMadeCutMean(prob) {
  if (prob <= 0) return 3;
  return -6.8 - 1.8 * Math.log(prob);
}
function histMcProb(prob) {
  const raw = 0.55 * (1 - Math.sqrt(Math.min(1, prob / 0.15)));
  return Math.max(0.05, Math.min(0.55, raw));
}
function histMadeStddev(prob) {
  return 4.0 + 1.5 * (1 - Math.min(1, prob / 0.15));
}
function histSkew(prob) {
  return 0.30 * (1 - 2 * Math.min(1, prob / 0.15));
}

// ── Name matching (mirrors useGolfData.js / useOdds.js) ─────────────────────
function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .replace(/ð/g, 'd').replace(/Ð/g, 'D')
    .toLowerCase();
}

function matchGolfer(pickName, golferMap) {
  if (!pickName || !golferMap) return null;
  const cleaned = pickName.replace(/\s*\(.*?\)\s*$/, '').trim();

  // Exact
  if (golferMap[cleaned]) return { name: cleaned, ...golferMap[cleaned] };

  // Case insensitive
  const lower = cleaned.toLowerCase();
  for (const [key, val] of Object.entries(golferMap)) {
    if (key.toLowerCase() === lower) return { name: key, ...val };
  }

  // Normalized (strip diacritics)
  const norm = normalize(cleaned);
  for (const [key, val] of Object.entries(golferMap)) {
    if (normalize(key) === norm) return { name: key, ...val };
  }

  // Partial match
  for (const [key, val] of Object.entries(golferMap)) {
    if (normalize(key).includes(norm) || norm.includes(normalize(key))) {
      return { name: key, ...val };
    }
  }

  // Last name
  const pickParts = norm.split(' ');
  const pickLast = pickParts[pickParts.length - 1];
  for (const [key, val] of Object.entries(golferMap)) {
    const keyNorm = normalize(key);
    const keyParts = keyNorm.split(' ');
    const keyLast = keyParts[keyParts.length - 1];
    if (keyLast === pickLast) {
      if (pickParts.length > 1 && keyParts.length > 1) {
        if (pickParts[0][0] === keyParts[0][0]) return { name: key, ...val };
      }
      return { name: key, ...val };
    }
  }
  return null;
}

function matchOdds(golferName, oddsData) {
  if (!golferName || !oddsData || Object.keys(oddsData).length === 0) return null;
  const cleaned = golferName.replace(/\s*\(.*?\)$/, '').trim();

  if (oddsData[cleaned]) return oddsData[cleaned];

  const lower = cleaned.toLowerCase();
  for (const [key, val] of Object.entries(oddsData)) {
    if (key.toLowerCase() === lower) return val;
  }

  const norm = normalize(cleaned);
  for (const [key, val] of Object.entries(oddsData)) {
    if (normalize(key) === norm) return val;
  }

  // Last name + first initial
  const parts = norm.split(' ');
  const last = parts[parts.length - 1];
  for (const [key, val] of Object.entries(oddsData)) {
    const keyParts = normalize(key).split(' ');
    if (keyParts[keyParts.length - 1] === last) {
      if (parts.length > 1 && keyParts.length > 1 && parts[0][0] === keyParts[0][0]) {
        return val;
      }
    }
  }

  // Loose last-name fallback
  for (const [key, val] of Object.entries(oddsData)) {
    const keyParts = normalize(key).split(' ');
    if (keyParts[keyParts.length - 1] === last) return val;
  }

  return null;
}

// ── ESPN parsing (mirrors useGolfData.js) ───────────────────────────────────
function parseESPN(data) {
  const golfers = {};
  try {
    const event = data?.events?.[0];
    if (!event) return golfers;
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];

    for (const c of competitors) {
      const athlete = c.athlete || {};
      const fullName = athlete.displayName || '';
      if (!fullName) continue;

      const scoreStr =
        (typeof c.score === 'string' ? c.score : c.score?.displayValue) ||
        c.statistics?.[0]?.displayValue || 'E';
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

      let thru = c.status?.displayValue || c.status?.thru?.toString() || '';
      let activeRound = null;
      for (const rs of (c.linescores || []).slice().reverse()) {
        if (rs?.linescores?.length > 0) { activeRound = rs; break; }
      }
      const holesPlayed = activeRound?.linescores?.length || 0;
      if (!thru && holesPlayed > 0) {
        thru = holesPlayed >= 18 ? 'F' : `${holesPlayed}`;
      }
      const position = c.status?.position?.displayName || c.sortOrder?.toString() || '';
      const currentRound = c.status?.period || activeRound?.period || '';

      golfers[fullName] = { score, status, thru, position, currentRound };

      // Secondary last-name key
      const parts = fullName.split(' ');
      if (parts.length >= 2) {
        const lastName = parts[parts.length - 1];
        if (!golfers[lastName]) golfers[lastName] = golfers[fullName];
      }
    }
  } catch (err) {
    log(`ESPN parse error: ${err.message}`);
  }
  return golfers;
}

// ── Odds parsing (mirrors useOdds.js) ───────────────────────────────────────
function parseOdds(json) {
  const oddsMap = {};
  for (const event of (json || [])) {
    for (const bookmaker of event.bookmakers || []) {
      for (const market of bookmaker.markets || []) {
        if (market.key !== 'outrights') continue;
        for (const outcome of market.outcomes || []) {
          const name = outcome.name;
          const price = outcome.price;
          if (!oddsMap[name]) {
            oddsMap[name] = { prices: [], bestPrice: -Infinity, book: null };
          }
          oddsMap[name].prices.push(price);
          if (price > oddsMap[name].bestPrice) {
            oddsMap[name].bestPrice = price;
            oddsMap[name].book = bookmaker.title;
          }
        }
      }
    }
  }

  const result = {};
  for (const [name, data] of Object.entries(oddsMap)) {
    const avgPrice = Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length);
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
  return result;
}

// ── MC penalty + projected cut (mirrors scoring.js) ─────────────────────────
function calcMcPenalty(golferData) {
  let worstMadeCut = -Infinity;
  let hasMadeCut = false;
  for (const [name, data] of Object.entries(golferData)) {
    if (!name.includes(' ')) continue;
    if (data.status === 'active') {
      hasMadeCut = true;
      if (data.score > worstMadeCut) worstMadeCut = data.score;
    }
  }
  return hasMadeCut ? worstMadeCut + 1 : 15;
}

function calcProjectedCut(golferData) {
  const scores = [];
  for (const [name, data] of Object.entries(golferData)) {
    if (!name.includes(' ')) continue;
    if (data.status === 'active') scores.push(data.score);
  }
  if (scores.length < 50) return 4;
  scores.sort((a, b) => a - b);
  return scores[49];
}

// ── Score entries (mirrors scoring.js scoreEntry) ───────────────────────────
function scoreEntries(golferData, mcPenalty) {
  return ENTRIES.map(entry => {
    const golfers = entry.picks.map(pickName => {
      const match = matchGolfer(pickName, golferData);
      if (!match) {
        return { name: pickName, score: null, status: 'unknown', thru: '', currentRound: '' };
      }
      let score = match.score;
      if (match.status === 'cut' || match.status === 'wd') score = mcPenalty;
      return {
        name: match.name,
        score,
        status: match.status,
        thru: match.thru || '',
        currentRound: match.currentRound || '',
      };
    });
    return { id: entry.id, name: entry.name, golfers };
  });
}

// ── Monte Carlo simulation (matches scoring.js calcWinProbabilities) ────────
function runMonteCarlo(scoredEntries, oddsData, golferData) {
  if (!oddsData || Object.keys(oddsData).length === 0) {
    // No odds: equal probabilities
    const p = {};
    for (const e of ENTRIES) p[e.id] = parseFloat((100 / ENTRIES.length).toFixed(1));
    return p;
  }

  const mcPenalty = golferData ? calcMcPenalty(golferData) : 15;
  const projCut = golferData ? calcProjectedCut(golferData) : 4;

  // Build golfer profiles
  const golferProfiles = {};
  for (const entry of scoredEntries) {
    for (const g of entry.golfers) {
      if (golferProfiles[g.name]) continue;

      if (g.status === 'cut' || g.status === 'wd') {
        golferProfiles[g.name] = {
          madeMean: g.score, madeStddev: 0, mcProb: 0, mcScore: g.score,
          skew: 0, locked: true,
        };
        continue;
      }

      const odds = matchOdds(g.name, oddsData);
      // impliedProb from odds API is a PERCENTAGE (0-100); convert to fraction
      const impliedProb = (odds?.impliedProb || 0.5) / 100;

      let madeMean = histMadeCutMean(impliedProb);
      let madeStddev = histMadeStddev(impliedProb);
      let mcProb = histMcProb(impliedProb);
      let skew = histSkew(impliedProb);

      // Per-golfer progress
      const thru = g.thru || '';
      const hasPlayed = thru && thru !== '0' && thru !== '';
      const round = parseInt(g.currentRound, 10) || 1;
      const completedRounds = Math.max(0, round - 1);
      const holesThisRound = hasPlayed
        ? (thru === 'F' || thru === '18' ? 18 : (parseInt(thru, 10) || 0))
        : 0;
      const golferHoles = completedRounds * 18 + holesThisRound;
      const golferProgress = Math.min(1, golferHoles / 72);

      // Blend actual score into mean
      if (hasPlayed && g.score !== null && golferHoles > 0) {
        const perHoleRate = madeMean / 72;
        const remainingHoles = 72 - golferHoles;
        const adjusted = g.score + perHoleRate * remainingHoles;
        const blendW = 0.05 + 0.90 * Math.pow(golferProgress, 1.5);
        madeMean = blendW * adjusted + (1 - blendW) * madeMean;
      }

      // Scale stddev down
      madeStddev *= (1.0 - 0.85 * golferProgress);

      // Adjust MC probability based on progress
      if (golferProgress >= 0.5) {
        mcProb = 0;
      } else if (hasPlayed && g.score !== null) {
        const overCut = g.score - projCut;
        if (overCut >= 2) {
          mcProb = Math.min(0.85, mcProb + 0.30 * Math.min(1, overCut / 4) * golferProgress * 4);
        } else if (overCut >= 0) {
          mcProb = Math.min(0.70, mcProb + 0.15 * golferProgress * 4);
        } else if (overCut <= -4) {
          mcProb *= Math.max(0.1, 1 - golferProgress * 2);
        }
      }

      skew *= (1 - golferProgress);

      golferProfiles[g.name] = {
        madeMean, madeStddev, mcProb, mcScore: mcPenalty, skew, locked: false,
      };
    }
  }

  // --- Run Monte Carlo (typed arrays) ---
  const n = scoredEntries.length;
  const entryIds = scoredEntries.map(e => e.id);
  const entryGolferNames = scoredEntries.map(e => e.golfers.map(g => g.name));

  const profileNames = Object.keys(golferProfiles);
  const numProfiles = profileNames.length;
  const pMadeMean = new Float64Array(numProfiles);
  const pMadeStddev = new Float64Array(numProfiles);
  const pMcProb = new Float64Array(numProfiles);
  const pMcScore = new Float64Array(numProfiles);
  const pSkew = new Float64Array(numProfiles);
  const pLocked = new Uint8Array(numProfiles);
  const pLockedScore = new Float64Array(numProfiles);
  const nameToIdx = {};

  for (let i = 0; i < numProfiles; i++) {
    const p = golferProfiles[profileNames[i]];
    pMadeMean[i] = p.madeMean;
    pMadeStddev[i] = p.madeStddev;
    pMcProb[i] = p.mcProb;
    pMcScore[i] = p.mcScore;
    pSkew[i] = p.skew;
    pLocked[i] = p.locked ? 1 : 0;
    pLockedScore[i] = p.locked ? p.madeMean : 0;
    nameToIdx[profileNames[i]] = i;
  }

  const entryGolferIdx = entryGolferNames.map(names =>
    names.map(name => nameToIdx[name] ?? -1)
  );

  const wins = new Float64Array(n);

  let seed = 42;
  function rand() {
    seed = (seed * 16807 + 0) % 2147483647;
    return seed / 2147483647;
  }
  function randNormal() {
    const u1 = rand();
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2);
  }

  const golferScores = new Float64Array(numProfiles);
  const sixScores = new Float64Array(6);

  for (let sim = 0; sim < NUM_SIMS; sim++) {
    for (let i = 0; i < numProfiles; i++) {
      if (pLocked[i]) {
        golferScores[i] = pLockedScore[i];
      } else if (rand() < pMcProb[i]) {
        golferScores[i] = Math.min(SCORE_CAP_HIGH, pMcScore[i] + 1.0 * randNormal());
      } else {
        let z = randNormal();
        const sk = pSkew[i];
        z = z < 0 ? z * (1 - sk) : z * (1 + sk);
        golferScores[i] = Math.max(SCORE_CAP_LOW, Math.min(SCORE_CAP_HIGH,
          pMadeMean[i] + pMadeStddev[i] * z));
      }
    }

    let bestTotal = Infinity;
    let tieCount = 1;
    const totals = new Float64Array(n);

    for (let e = 0; e < n; e++) {
      const idxs = entryGolferIdx[e];
      for (let g = 0; g < 6; g++) {
        sixScores[g] = idxs[g] >= 0 ? golferScores[idxs[g]] : 10;
      }
      sixScores.sort();
      const best4 = sixScores[0] + sixScores[1] + sixScores[2] + sixScores[3];
      totals[e] = best4;
      if (best4 < bestTotal - 0.01) {
        bestTotal = best4;
        tieCount = 1;
      } else if (Math.abs(best4 - bestTotal) < 0.01) {
        tieCount++;
      }
    }

    if (tieCount === 1) {
      for (let e = 0; e < n; e++) {
        if (Math.abs(totals[e] - bestTotal) < 0.01) { wins[e] += 1; break; }
      }
    } else {
      const credit = 1 / tieCount;
      for (let e = 0; e < n; e++) {
        if (Math.abs(totals[e] - bestTotal) < 0.01) wins[e] += credit;
      }
    }
  }

  const result = {};
  for (let e = 0; e < n; e++) {
    result[entryIds[e]] = parseFloat(((wins[e] / NUM_SIMS) * 100).toFixed(1));
  }
  return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function log(msg) {
  process.stderr.write(`[snapshot] ${msg}\n`);
}

function loadHistory() {
  // Try win-history.json first
  if (existsSync(HISTORY_PATH)) {
    try {
      const raw = readFileSync(HISTORY_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        log(`Loaded ${parsed.length} existing snapshots from win-history.json`);
        return parsed;
      }
    } catch (err) {
      log(`Error reading win-history.json: ${err.message}`);
    }
  }

  // Fall back to backfillHistory.js
  if (existsSync(BACKFILL_PATH)) {
    try {
      const raw = readFileSync(BACKFILL_PATH, 'utf-8');
      // Extract the array from: export const BACKFILL_HISTORY = [ ... ];
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0].replace(/,\s*\]/g, ']'));
        if (Array.isArray(parsed)) {
          log(`Seeded ${parsed.length} snapshots from backfillHistory.js`);
          return parsed;
        }
      }
    } catch (err) {
      log(`Error parsing backfillHistory.js: ${err.message}`);
    }
  }

  log('No existing history found, starting fresh');
  return [];
}

function saveHistory(history) {
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 0), 'utf-8');
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  log(`Starting snapshot at ${new Date().toISOString()}`);

  // Fetch ESPN
  let golferData = {};
  try {
    log('Fetching ESPN scoreboard...');
    const res = await fetch(ESPN_URL);
    if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
    const json = await res.json();
    golferData = parseESPN(json);
    const count = Object.keys(golferData).filter(k => k.includes(' ')).length;
    log(`ESPN: ${count} golfers parsed`);
  } catch (err) {
    log(`ESPN fetch failed: ${err.message} — proceeding with empty golfer data`);
  }

  // Fetch Odds (cached — re-fetch only every 15 min to stay within 500 req/mo)
  let oddsData = {};
  let usedCache = false;
  try {
    if (existsSync(ODDS_CACHE_PATH)) {
      const raw = readFileSync(ODDS_CACHE_PATH, 'utf-8');
      const cached = JSON.parse(raw);
      if (cached._ts && Date.now() - cached._ts < ODDS_CACHE_TTL) {
        delete cached._ts;
        oddsData = cached;
        usedCache = true;
        log(`Odds: using cached data (${Object.keys(oddsData).length} golfers, ${Math.round((Date.now() - JSON.parse(readFileSync(ODDS_CACHE_PATH, 'utf-8'))._ts) / 60000)}m old)`);
      }
    }
  } catch {}

  if (!usedCache) {
    try {
      log('Fetching fresh odds...');
      const res = await fetch(ODDS_URL);
      if (!res.ok) {
        const remaining = res.headers.get('x-requests-remaining');
        throw new Error(`Odds API HTTP ${res.status} (remaining: ${remaining})`);
      }
      const remaining = res.headers.get('x-requests-remaining');
      log(`Odds API: OK, requests remaining: ${remaining}`);
      const json = await res.json();
      oddsData = parseOdds(json);
      log(`Odds: ${Object.keys(oddsData).length} golfers`);
      // Cache to disk
      writeFileSync(ODDS_CACHE_PATH, JSON.stringify({ _ts: Date.now(), ...oddsData }));
    } catch (err) {
      log(`Odds fetch failed: ${err.message} — proceeding without odds`);
    }
  }

  // Score entries
  const mcPenalty = Object.keys(golferData).length > 0 ? calcMcPenalty(golferData) : 15;
  const scored = scoreEntries(golferData, mcPenalty);

  // Run Monte Carlo
  log(`Running ${NUM_SIMS} simulations...`);
  const winProbs = runMonteCarlo(scored, oddsData, golferData);

  // Log results
  for (const entry of ENTRIES) {
    log(`  ${entry.name}: ${winProbs[entry.id]}%`);
  }

  // Append to history
  const history = loadHistory();
  const snapshot = { t: Date.now(), p: winProbs };
  history.push(snapshot);
  saveHistory(history);
  log(`Saved snapshot #${history.length} to win-history.json`);
  log('Done.');
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
