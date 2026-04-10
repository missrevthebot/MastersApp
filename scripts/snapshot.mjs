#!/usr/bin/env node
/**
 * snapshot.mjs — Fetch ESPN, score each entry (best 4 of 6), append snapshot.
 * No MC, no odds. Just real scores.
 *
 * Format: { t: timestamp, s: { e1: best4Total, e2: best4Total, ... } }
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = join(__dirname, 'score-history.json');

const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';

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

const AUGUSTA_PARS = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4];

function log(msg) { process.stderr.write(`[snapshot] ${msg}\n`); }

function normalize(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .toLowerCase();
}

function matchGolfer(pickName, golferMap) {
  if (!pickName || !golferMap) return null;
  const cleaned = pickName.replace(/\s*\(.*?\)\s*$/, '').trim();
  if (golferMap[cleaned]) return { name: cleaned, ...golferMap[cleaned] };
  const lower = cleaned.toLowerCase();
  for (const [k, v] of Object.entries(golferMap)) {
    if (k.toLowerCase() === lower) return { name: k, ...v };
  }
  const norm = normalize(cleaned);
  for (const [k, v] of Object.entries(golferMap)) {
    if (normalize(k) === norm) return { name: k, ...v };
  }
  const parts = norm.split(' ');
  const last = parts[parts.length - 1];
  for (const [k, v] of Object.entries(golferMap)) {
    const kp = normalize(k).split(' ');
    if (kp[kp.length - 1] === last) return { name: k, ...v };
  }
  return null;
}

function calcMcPenalty(golferData) {
  let worst = -Infinity, has = false;
  for (const [name, data] of Object.entries(golferData)) {
    if (!name.includes(' ')) continue;
    if (data.status === 'active') { has = true; if (data.score > worst) worst = data.score; }
  }
  return has ? worst + 1 : 15;
}

function scoreEntry(entry, golferData, mcPenalty) {
  const scores = entry.picks.map(pick => {
    const m = matchGolfer(pick, golferData);
    if (!m) return 0;
    return (m.status === 'cut' || m.status === 'wd') ? mcPenalty : m.score;
  }).sort((a, b) => a - b);
  return scores.slice(0, 4).reduce((s, v) => s + v, 0);
}

function parseESPN(data) {
  const golfers = {};
  const event = data?.events?.[0];
  if (!event) return golfers;
  for (const c of (event.competitions?.[0]?.competitors || [])) {
    const name = c.athlete?.displayName || '';
    if (!name) continue;
    const scoreStr = (typeof c.score === 'string' ? c.score : c.score?.displayValue) || 'E';
    let score = 0;
    if (scoreStr !== 'E' && scoreStr !== '-') score = parseInt(scoreStr, 10) || 0;
    let status = 'active';
    const ps = c.status?.type?.name || '';
    if (ps === 'cut' || ps === 'CUT') status = 'cut';
    else if (ps === 'wd' || ps === 'WD') status = 'wd';

    const rounds = [];
    for (const rs of (c.linescores || [])) {
      const holes = (rs?.linescores || []).map(h => ({ hole: h.period, strokes: h.value }));
      if (holes.length > 0) rounds.push({ round: rs.period || rounds.length + 1, holes });
    }

    golfers[name] = { score, status, rounds };
  }
  return golfers;
}

// ── Backfill: reconstruct scores at each hole from linescores ──────────────
function backfillFromHoleData(golferData) {
  // Build per-golfer cumulative score timeline
  const timelines = {}; // name -> [{ totalHoles, cumScore }]
  for (const [name, data] of Object.entries(golferData)) {
    if (!name.includes(' ') || !data.rounds?.length) continue;
    const tl = [{ totalHoles: 0, cumScore: 0 }];
    let cum = 0, total = 0;
    for (const round of data.rounds) {
      for (const hole of round.holes) {
        const par = AUGUSTA_PARS[(hole.hole - 1) % 18] || 4;
        cum += (hole.strokes - par);
        total++;
        tl.push({ totalHoles: total, cumScore: cum });
      }
    }
    timelines[name] = tl;
  }

  // Find max holes any pool golfer has played
  const poolGolfers = new Set();
  for (const e of ENTRIES) for (const p of e.picks) poolGolfers.add(p);
  let maxHoles = 0;
  for (const pick of poolGolfers) {
    const m = matchGolfer(pick, golferData);
    if (m?.rounds) {
      let h = 0;
      for (const r of m.rounds) h += r.holes.length;
      if (h > maxHoles) maxHoles = h;
    }
  }
  if (maxHoles < 1) return [];

  // Snapshot at every hole
  const R1_START = new Date('2026-04-10T12:00:00Z').getTime();
  const now = Date.now();
  const snapshots = [];

  for (let targetHole = 1; targetHole <= maxHoles; targetHole++) {
    const t = R1_START + ((now - R1_START) * targetHole) / (maxHoles + 1);

    // Score each entry at this point in time
    const snap = { t: Math.round(t), s: {} };
    for (const entry of ENTRIES) {
      const scores = entry.picks.map(pick => {
        const m = matchGolfer(pick, golferData);
        if (!m) return 0;
        const tl = timelines[m.name] || [{ totalHoles: 0, cumScore: 0 }];
        let state = tl[0];
        for (const pt of tl) {
          if (pt.totalHoles <= targetHole) state = pt;
          else break;
        }
        return state.cumScore;
      }).sort((a, b) => a - b);
      snap.s[entry.id] = scores.slice(0, 4).reduce((s, v) => s + v, 0);
    }
    snapshots.push(snap);
  }
  return snapshots;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  log(`Starting at ${new Date().toISOString()}`);

  let golferData = {};
  try {
    const res = await fetch(ESPN_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    golferData = parseESPN(await res.json());
    log(`ESPN: ${Object.keys(golferData).filter(k => k.includes(' ')).length} golfers`);
  } catch (err) {
    log(`ESPN failed: ${err.message}`);
    return;
  }

  const mcPenalty = calcMcPenalty(golferData);

  // Load existing history
  let history = [];
  if (existsSync(HISTORY_PATH)) {
    try { history = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8')); } catch {}
  }

  // Backfill if empty
  if (history.length === 0) {
    log('No history — backfilling from hole-by-hole data...');
    history = backfillFromHoleData(golferData);
    log(`Backfilled ${history.length} snapshots`);
  }

  // Current snapshot
  const snap = { t: Date.now(), s: {} };
  for (const entry of ENTRIES) {
    snap.s[entry.id] = scoreEntry(entry, golferData, mcPenalty);
  }
  history.push(snap);

  // Log leader
  const sorted = ENTRIES.map(e => ({ name: e.name, score: snap.s[e.id] })).sort((a, b) => a.score - b.score);
  log(`Leader: ${sorted[0].name} (${sorted[0].score >= 0 ? '+' : ''}${sorted[0].score})`);

  writeFileSync(HISTORY_PATH, JSON.stringify(history));
  log(`Saved snapshot #${history.length}`);
}

main().catch(e => { log(`Fatal: ${e.message}`); process.exit(1); });
