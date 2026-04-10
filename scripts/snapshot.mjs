#!/usr/bin/env node
/**
 * snapshot.mjs — Fetch ESPN, compute best-4-of-6 entry scores.
 * Appends { t: Date.now(), s: { e1: score, ... } } to score-history.json.
 * Real timestamps only — no backfill or tee-time estimation.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = join(__dirname, 'score-history.json');
const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';

const ENTRIES = [
  { id: 'e1', picks: ['Jon Rahm', 'Ludvig Aberg', 'Patrick Reed', 'J.J. Spaun', 'Gary Woodland', 'Max Greyserman'] },
  { id: 'e2', picks: ['Jon Rahm', 'Justin Rose', 'Patrick Reed', 'J.J. Spaun', 'Gary Woodland', 'Nick Taylor'] },
  { id: 'e3', picks: ['Rory McIlroy', 'Ludvig Aberg', 'Robert MacIntyre', 'Maverick McNealy', 'Gary Woodland', 'Wyndham Clark'] },
  { id: 'e4', picks: ['Bryson DeChambeau', 'Xander Schauffele', 'Chris Gotterup', 'J.J. Spaun', 'Keegan Bradley', 'Nick Taylor'] },
  { id: 'e5', picks: ['Jon Rahm', 'Hideki Matsuyama', 'Si Woo Kim', 'Kurt Kitayama', 'Sungjae Im', 'Hao-Tong Li'] },
  { id: 'e6', picks: ['Rory McIlroy', 'Tommy Fleetwood', 'Sepp Straka', 'J.J. Spaun', 'Daniel Berger', 'Bubba Watson'] },
  { id: 'e7', picks: ['Scottie Scheffler', 'Cameron Young', 'Patrick Reed', 'Sam Burns', 'Gary Woodland', 'Ryan Gerard'] },
  { id: 'e8', picks: ['Bryson DeChambeau', 'Brooks Koepka', 'Robert MacIntyre', 'Corey Conners', 'Ben Griffin', 'Brian Harman'] },
  { id: 'e9', picks: ['Scottie Scheffler', 'Xander Schauffele', 'Si Woo Kim', 'Sam Burns', 'Keegan Bradley', 'Bubba Watson'] },
  { id: 'e10', picks: ['Jon Rahm', 'Ludvig Aberg', 'Min Woo Lee', 'J.J. Spaun', 'Ben Griffin', 'Brian Harman'] },
  { id: 'e11', picks: ['Scottie Scheffler', 'Matt Fitzpatrick', 'Russell Henley', 'Maverick McNealy', 'Harry Hall', 'Nick Taylor'] },
  { id: 'e12', picks: ['Scottie Scheffler', 'Xander Schauffele', 'Viktor Hovland', 'Corey Conners', 'Sungjae Im', 'Wyndham Clark'] },
  { id: 'e13', picks: ['Rory McIlroy', 'Tommy Fleetwood', 'Si Woo Kim', 'J.J. Spaun', 'Gary Woodland', 'Hao-Tong Li'] },
  { id: 'e14', picks: ['Bryson DeChambeau', 'Xander Schauffele', 'Patrick Reed', 'Corey Conners', 'Daniel Berger', 'Sergio Garcia'] },
  { id: 'e15', picks: ['Scottie Scheffler', 'Ludvig Aberg', 'Viktor Hovland', 'Sam Burns', 'Sungjae Im', 'Brian Harman'] },
  { id: 'e16', picks: ['Bryson DeChambeau', 'Xander Schauffele', 'Patrick Reed', 'Matthew McCarty', 'Max Homa', 'Sergio Garcia'] },
  { id: 'e17', picks: ['Scottie Scheffler', 'Hideki Matsuyama', 'Robert MacIntyre', 'Jacob Bridgeman', 'Alexander Noren', 'Ryan Gerard'] },
];

function log(msg) { process.stderr.write(`[snapshot] ${msg}\n`); }

function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g,'o').replace(/Ø/g,'O').replace(/æ/g,'ae').replace(/Æ/g,'AE').toLowerCase();
}

function matchGolfer(pick, map) {
  if (!pick || !map) return null;
  const c = pick.replace(/\s*\(.*?\)\s*$/, '').trim();
  if (map[c]) return { name: c, ...map[c] };
  const lo = c.toLowerCase();
  for (const [k, v] of Object.entries(map)) { if (k.toLowerCase() === lo) return { name: k, ...v }; }
  const n = normalize(c);
  for (const [k, v] of Object.entries(map)) { if (normalize(k) === n) return { name: k, ...v }; }
  const last = n.split(' ').pop();
  for (const [k, v] of Object.entries(map)) { if (normalize(k).split(' ').pop() === last) return { name: k, ...v }; }
  return null;
}

function parseESPN(data) {
  const golfers = {};
  const event = data?.events?.[0];
  if (!event) return golfers;
  const competitors = event.competitions?.[0]?.competitors || [];
  for (const c of competitors) {
    const name = c.athlete?.displayName || '';
    if (!name) continue;
    const scoreStr = (typeof c.score === 'string' ? c.score : c.score?.displayValue) || 'E';
    let score = 0;
    if (scoreStr !== 'E' && scoreStr !== '-') score = parseInt(scoreStr, 10) || 0;
    let status = 'active';
    const ps = c.status?.type?.name || '';
    if (ps === 'cut' || ps === 'CUT') status = 'cut';
    else if (ps === 'wd' || ps === 'WD') status = 'wd';
    golfers[name] = { score, status };
  }
  return golfers;
}

function calcMcPenalty(golferData) {
  let worst = -Infinity, has = false;
  for (const [name, data] of Object.entries(golferData)) {
    if (!name.includes(' ')) continue;
    if (data.status === 'active') { has = true; if (data.score > worst) worst = data.score; }
  }
  return has ? worst + 1 : 15;
}

async function main() {
  let golferData = {};
  try {
    const res = await fetch(ESPN_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    golferData = parseESPN(await res.json());
    const count = Object.keys(golferData).filter(k => k.includes(' ')).length;
    if (count === 0) { log('No golfers found'); return; }
  } catch (err) { log(`ESPN failed: ${err.message}`); return; }

  // Load existing history
  let history = [];
  if (existsSync(HISTORY_PATH)) {
    try { history = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8')); } catch {}
  }

  // Compute current scores
  const mcPenalty = calcMcPenalty(golferData);
  const snap = { t: Date.now(), s: {} };
  for (const entry of ENTRIES) {
    const scores = entry.picks.map(p => {
      const m = matchGolfer(p, golferData);
      if (!m) return 0;
      return (m.status === 'cut' || m.status === 'wd') ? mcPenalty : m.score;
    }).sort((a, b) => a - b);
    snap.s[entry.id] = scores.slice(0, 4).reduce((s, v) => s + v, 0);
  }

  // Only append if different from last
  const last = history[history.length - 1];
  const changed = !last || Object.keys(snap.s).some(id => snap.s[id] !== last.s[id]);
  if (changed) {
    history.push(snap);
    writeFileSync(HISTORY_PATH, JSON.stringify(history));
  }

  const sorted = ENTRIES.map(e => ({ id: e.id, s: snap.s[e.id] })).sort((a, b) => a.s - b.s);
  log(`${sorted[0].id} leads (${sorted[0].s >= 0 ? '+' : ''}${sorted[0].s}), ${history.length} snaps`);
}

main().catch(e => { log(`Fatal: ${e.message}`); process.exit(1); });
