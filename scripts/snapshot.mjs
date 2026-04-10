#!/usr/bin/env node
/**
 * snapshot.mjs — Fetch ESPN, compute best-4-of-6 entry scores.
 * Appends { t: timestamp, s: { e1: score, ... } } to score-history.json.
 * For backfill: reconstructs from hole-by-hole data using sortOrder for tee time estimates.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = join(__dirname, 'score-history.json');
const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';
const PARS = [4,5,4,3,4,3,4,5,4,4,4,3,5,4,5,3,4,4];

// Round start times (ET → UTC): 8am ET rounds 1-2, 10am ET rounds 3-4
const ROUND_STARTS = [
  new Date('2026-04-10T12:00:00Z').getTime(), // R1
  new Date('2026-04-11T12:00:00Z').getTime(), // R2
  new Date('2026-04-12T14:00:00Z').getTime(), // R3
  new Date('2026-04-13T14:00:00Z').getTime(), // R4
];

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
  for (let ci = 0; ci < competitors.length; ci++) {
    const c = competitors[ci];
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
    // Use array index as proxy for tee time order (ESPN returns competitors roughly in tee time order)
    golfers[name] = { score, status, rounds, order: ci };
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

/**
 * Build chronological event stream from hole-by-hole data.
 * Each golfer's holes get timestamps based on their estimated tee time.
 * ~30 groups, ~11 min gap, ~15 min per hole.
 */
function buildBackfill(golferData) {
  const TEE_GAP = 11 * 60 * 1000;   // 11 min between groups
  const HOLE_PACE = 15 * 60 * 1000; // 15 min per hole

  // Build per-golfer hole events with estimated timestamps
  const events = []; // { t, golferName, cumScore }
  const golferCum = {}; // name -> running cumulative score

  for (const [name, data] of Object.entries(golferData)) {
    if (!name.includes(' ') || !data.rounds?.length) continue;
    const groupIdx = Math.floor((data.order || 0) / 3);
    let cum = 0;

    for (const round of data.rounds) {
      const roundIdx = round.round - 1;
      const roundStart = ROUND_STARTS[roundIdx] || ROUND_STARTS[0];
      const teeTime = roundStart + groupIdx * TEE_GAP;

      for (const hole of round.holes) {
        const par = PARS[(hole.hole - 1) % 18] || 4;
        cum += (hole.strokes - par);
        const finishTime = teeTime + hole.hole * HOLE_PACE;
        events.push({ t: finishTime, name, cumScore: cum });
      }
    }
    golferCum[name] = 0; // init
  }

  events.sort((a, b) => a.t - b.t);
  if (events.length === 0) return [];

  // Walk events, snapshot every 5 min of active play
  const SNAP_INTERVAL = 5 * 60 * 1000;
  const runningScores = {}; // golferName -> cumScore
  const snapshots = [];

  // Seed at first event time
  let nextSnap = events[0].t;

  function takeSnapshot(t) {
    const snap = { t: Math.round(t), s: {} };
    for (const entry of ENTRIES) {
      const scores = entry.picks.map(p => {
        const m = matchGolfer(p, golferData);
        if (!m) return 0;
        return runningScores[m.name] ?? 0;
      }).sort((a, b) => a - b);
      snap.s[entry.id] = scores.slice(0, 4).reduce((s, v) => s + v, 0);
    }
    snapshots.push(snap);
  }

  // Opening snapshot: all zeros
  takeSnapshot(events[0].t - 1000);

  for (const ev of events) {
    // Emit snapshots at intervals up to this event
    while (nextSnap <= ev.t) {
      takeSnapshot(nextSnap);
      nextSnap += SNAP_INTERVAL;
    }
    runningScores[ev.name] = ev.cumScore;
  }

  // Final snapshot after all events
  takeSnapshot(events[events.length - 1].t + 1000);

  return snapshots;
}

async function main() {
  log(`Starting at ${new Date().toISOString()}`);
  let golferData = {};
  try {
    const res = await fetch(ESPN_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    golferData = parseESPN(await res.json());
    log(`ESPN: ${Object.keys(golferData).filter(k => k.includes(' ')).length} golfers`);
  } catch (err) { log(`ESPN failed: ${err.message}`); return; }

  // Load or backfill
  let history = [];
  if (existsSync(HISTORY_PATH)) {
    try { history = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8')); } catch {}
  }

  if (history.length === 0) {
    log('Backfilling from hole-by-hole data...');
    history = buildBackfill(golferData);
    log(`Backfilled ${history.length} snapshots`);
  }

  // Current snapshot
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
  }

  const sorted = ENTRIES.map(e => ({ id: e.id, s: snap.s[e.id] })).sort((a, b) => a.s - b.s);
  log(`Leader: ${sorted[0].id} (${sorted[0].s >= 0 ? '+' : ''}${sorted[0].s}), ${history.length} total snapshots`);

  writeFileSync(HISTORY_PATH, JSON.stringify(history));
}

main().catch(e => { log(`Fatal: ${e.message}`); process.exit(1); });
