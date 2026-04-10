import { matchGolfer } from './hooks/useGolfData';
import { matchOdds } from './hooks/useOdds';

/**
 * Projected cut line using Masters rules: top 50 + ties make the cut.
 * Looks at all active golfers' scores, sorts them, and returns the
 * score at position 50 (0-indexed 49). Falls back to +4 if not enough data.
 */
export function calcProjectedCut(golferData) {
  const scores = [];
  for (const [name, data] of Object.entries(golferData)) {
    if (!name.includes(' ')) continue;
    if (data.status === 'active') {
      scores.push(data.score);
    }
  }
  if (scores.length < 50) return 4; // not enough data yet
  scores.sort((a, b) => a - b);
  return scores[49]; // score at 50th place
}

/**
 * Calculate the MC penalty: worst made-cut score + 1.
 */
export function calcMcPenalty(golferData) {
  let worstMadeCut = -Infinity;
  let hasMadeCut = false;

  for (const [name, data] of Object.entries(golferData)) {
    if (!name.includes(' ')) continue;
    if (data.status === 'active') {
      hasMadeCut = true;
      if (data.score > worstMadeCut) {
        worstMadeCut = data.score;
      }
    }
  }

  if (!hasMadeCut) return 15;
  return worstMadeCut + 1;
}

/**
 * Score a single golfer pick.
 */
export function scoreGolfer(pickName, golferData, mcPenalty) {
  const match = matchGolfer(pickName, golferData);

  if (!match) {
    return {
      name: pickName,
      score: null,
      displayScore: '--',
      status: 'unknown',
      thru: '',
      position: '',
      currentRound: '',
    };
  }

  let score = match.score;
  const status = match.status;

  if (status === 'cut' || status === 'wd') {
    score = mcPenalty;
  }

  return {
    name: match.name,
    score,
    displayScore: formatScore(score),
    status,
    thru: match.thru || '',
    position: match.position || '',
    currentRound: match.currentRound || '',
  };
}

/**
 * Score a full entry.
 */
export function scoreEntry(entry, golferData, mcPenalty) {
  const golfers = entry.picks.map(pick => scoreGolfer(pick, golferData, mcPenalty));

  const validScores = golfers
    .map(g => g.score)
    .filter(s => s !== null)
    .sort((a, b) => a - b);

  let best4Total = null;
  let drops = [];

  if (validScores.length >= 4) {
    best4Total = validScores.slice(0, 4).reduce((sum, s) => sum + s, 0);
    drops = validScores.slice(4);
  } else if (validScores.length > 0) {
    best4Total = validScores.reduce((sum, s) => sum + s, 0);
  }

  return {
    id: entry.id,
    name: entry.name,
    golfers,
    best4Total,
    drops,
    allScores: validScores,
  };
}

/**
 * Score all entries and rank them.
 */
export function scoreAndRank(entries, golferData) {
  const mcPenalty = calcMcPenalty(golferData);
  const scored = entries.map(e => scoreEntry(e, golferData, mcPenalty));

  scored.sort((a, b) => {
    if (a.best4Total === null && b.best4Total === null) return 0;
    if (a.best4Total === null) return 1;
    if (b.best4Total === null) return -1;
    if (a.best4Total !== b.best4Total) return a.best4Total - b.best4Total;
    const a5 = a.allScores[4] ?? Infinity;
    const b5 = b.allScores[4] ?? Infinity;
    if (a5 !== b5) return a5 - b5;
    const a6 = a.allScores[5] ?? Infinity;
    const b6 = b.allScores[5] ?? Infinity;
    return a6 - b6;
  });

  let rank = 1;
  for (let i = 0; i < scored.length; i++) {
    if (i > 0 && scored[i].best4Total === scored[i - 1].best4Total) {
      scored[i].rank = scored[i - 1].rank;
    } else {
      scored[i].rank = rank;
    }
    rank = i + 2;
  }

  return { scored, mcPenalty };
}

/**
 * Monte Carlo win probability simulation.
 *
 * For each golfer in the pool, builds a projected mean + stddev for their
 * final score. Then runs N simulations where each golfer gets a random
 * final score (shared across all entries that picked them). For each sim,
 * applies best-4-of-6 scoring and tracks who wins.
 *
 * This properly handles:
 * - Overlapping picks (shared golfers move together)
 * - Unique picks (your edge comes from golfers only you have)
 * - The drop-2 mechanic (best 4 of 6)
 * - MC/WD golfers (locked at penalty score, no variance)
 */
const DEFAULT_NUM_SIMS = 25000;

export function calcWinProbabilities(scoredEntries, oddsData, golferData, numSims = DEFAULT_NUM_SIMS) {
  const empty = { winProbabilities: {}, simDetails: {} };
  if (!oddsData || Object.keys(oddsData).length === 0) return empty;
  if (scoredEntries.length === 0) return empty;

  // MC penalty for cut/WD golfers
  const mcPenalty = golferData ? calcMcPenalty(golferData) : 15;
  const projCut = golferData ? calcProjectedCut(golferData) : 4;

  // --- Historical Masters calibration ---
  // Score caps from Masters history:
  //   Best: record is -18 (Tiger '97, DJ '20). Cap at -23 (record - 5).
  //   Worst: worst 72-hole finisher in last 20yr ~+24. Floor at +29 (+5 buffer).
  const SCORE_CAP_LOW = -23;
  const SCORE_CAP_HIGH = 29;

  // Made-cut mean: calibrated so entry medians ~-18 to -22 (strong), ~0 (weak).
  // Individual: favorite(12%)→-3, mid(5%)→-1.4, contender(2%)→+0.2, longshot(0.5%)→+2.7
  // No real top-4 pool entry has ever broken -40, so that's near the ceiling.
  function histMadeCutMean(prob) {
    if (prob <= 0) return 3;
    return -6.8 - 1.8 * Math.log(prob);
  }
  // MC probability: favorites ~6%, mid ~23%, longshots ~45%
  function histMcProb(prob) {
    const raw = 0.55 * (1 - Math.sqrt(Math.min(1, prob / 0.15)));
    return Math.max(0.05, Math.min(0.55, raw));
  }
  // Made-cut stddev: favorites ~4.3, longshots ~5.5.
  // With skew, individual range: Scottie ~-15 to +9, longshot ~-8 to +14.
  // Entry medians land ~-20 (strong) to ~0 (weak).
  function histMadeStddev(prob) {
    return 4.0 + 1.5 * (1 - Math.min(1, prob / 0.15));
  }
  // Skew: negative for favorites (fatter good-score tail), positive for longshots
  function histSkew(prob) {
    return 0.30 * (1 - 2 * Math.min(1, prob / 0.15));
  }

  // Build golfer profiles with mixture model: MC penalty path + made-cut path
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
      // impliedProb from odds API is a percentage (0-100); convert to fraction
      const impliedProb = (odds?.impliedProb || 0.5) / 100;

      // Baseline from historical calibration
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

      // Blend actual score into mean as tournament progresses
      if (hasPlayed && g.score !== null && golferHoles > 0) {
        // Project: current score + expected per-hole rate for remaining holes
        const perHoleRate = madeMean / 72;
        const remainingHoles = 72 - golferHoles;
        const adjusted = g.score + perHoleRate * remainingHoles;
        const blendW = 0.05 + 0.90 * Math.pow(golferProgress, 1.5);
        madeMean = blendW * adjusted + (1 - blendW) * madeMean;
      }

      // Scale stddev down as holes lock in
      madeStddev *= (1.0 - 0.85 * golferProgress);

      // Adjust MC probability based on progress and score vs cut
      if (golferProgress >= 0.5) {
        // Past the cut — active golfers made it
        mcProb = 0;
      } else if (hasPlayed && g.score !== null) {
        const overCut = g.score - projCut;
        if (overCut >= 2) {
          // Well above cut: MC much more likely
          mcProb = Math.min(0.85, mcProb + 0.30 * Math.min(1, overCut / 4) * golferProgress * 4);
        } else if (overCut >= 0) {
          mcProb = Math.min(0.70, mcProb + 0.15 * golferProgress * 4);
        } else if (overCut <= -4) {
          // Well below cut: MC very unlikely
          mcProb *= Math.max(0.1, 1 - golferProgress * 2);
        }
      }

      // Reduce skew as more data comes in
      skew *= (1 - golferProgress);

      golferProfiles[g.name] = {
        madeMean, madeStddev, mcProb, mcScore: mcPenalty, skew, locked: false,
      };
    }
  }

  // --- Run Monte Carlo (typed arrays for speed) ---
  const n = scoredEntries.length;
  const entryIds = scoredEntries.map(e => e.id);
  const entryGolferNames = scoredEntries.map(e => e.golfers.map(g => g.name));

  // Pre-resolve profiles into typed arrays
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
  const allTotals = new Float64Array(n * numSims);

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

  for (let sim = 0; sim < numSims; sim++) {
    // Draw golfer scores — mixture model with Masters-calibrated caps
    for (let i = 0; i < numProfiles; i++) {
      if (pLocked[i]) {
        golferScores[i] = pLockedScore[i];
      } else if (rand() < pMcProb[i]) {
        // Missed cut: penalty score with slight noise, capped at historical worst
        golferScores[i] = Math.min(SCORE_CAP_HIGH, pMcScore[i] + 1.0 * randNormal());
      } else {
        // Made cut: skewed normal, clamped to realistic Masters range
        let z = randNormal();
        const sk = pSkew[i];
        z = z < 0 ? z * (1 - sk) : z * (1 + sk);
        golferScores[i] = Math.max(SCORE_CAP_LOW, Math.min(SCORE_CAP_HIGH,
          pMadeMean[i] + pMadeStddev[i] * z));
      }
    }

    // Score each entry (best 4 of 6)
    let bestTotal = Infinity;
    let tieCount = 1;
    for (let e = 0; e < n; e++) {
      const idxs = entryGolferIdx[e];
      for (let g = 0; g < 6; g++) {
        sixScores[g] = idxs[g] >= 0 ? golferScores[idxs[g]] : 10;
      }
      sixScores.sort();
      const best4 = sixScores[0] + sixScores[1] + sixScores[2] + sixScores[3];
      allTotals[e * numSims + sim] = best4;
      if (best4 < bestTotal - 0.01) {
        bestTotal = best4;
        tieCount = 1;
      } else if (Math.abs(best4 - bestTotal) < 0.01) {
        tieCount++;
      }
    }

    // Credit winners
    if (tieCount === 1) {
      for (let e = 0; e < n; e++) {
        if (Math.abs(allTotals[e * numSims + sim] - bestTotal) < 0.01) {
          wins[e] += 1;
          break;
        }
      }
    } else {
      const credit = 1 / tieCount;
      for (let e = 0; e < n; e++) {
        if (Math.abs(allTotals[e * numSims + sim] - bestTotal) < 0.01) {
          wins[e] += credit;
        }
      }
    }
  }

  // --- Build per-entry stats ---
  const result = {};
  const details = {};
  const sortBuf = new Float64Array(numSims);

  for (let e = 0; e < n; e++) {
    const id = entryIds[e];
    const rawWins = wins[e];
    const winPct = parseFloat(((rawWins / numSims) * 100).toFixed(1));
    // Use -1 to signal "<1%" (has wins but rounds to 0), 0 for true elimination
    result[id] = rawWins > 0 && winPct === 0 ? -1 : winPct;

    const offset = e * numSims;
    for (let i = 0; i < numSims; i++) sortBuf[i] = allTotals[offset + i];
    sortBuf.sort();

    const p25 = sortBuf[Math.floor(numSims * 0.25)];
    const median = sortBuf[Math.floor(numSims * 0.5)];
    const p75 = sortBuf[Math.floor(numSims * 0.75)];
    const min = sortBuf[0];
    const max = sortBuf[numSims - 1];

    // Avg of bottom 5% (best outcomes) and top 5% (worst outcomes)
    const tail5 = Math.max(1, Math.floor(numSims * 0.05));
    let bestSum = 0, worstSum = 0;
    for (let i = 0; i < tail5; i++) bestSum += sortBuf[i];
    for (let i = numSims - tail5; i < numSims; i++) worstSum += sortBuf[i];
    const bestCase = bestSum / tail5;
    const worstCase = worstSum / tail5;

    // Histogram
    const range = max - min || 1;
    const numBins = 20;
    const bins = new Uint32Array(numBins);
    for (let i = 0; i < numSims; i++) {
      const bin = Math.min(numBins - 1, Math.floor(((sortBuf[i] - min) / range) * numBins));
      bins[bin]++;
    }
    let maxBin = 0;
    for (let i = 0; i < numBins; i++) if (bins[i] > maxBin) maxBin = bins[i];
    const histogram = Array.from(bins, b => b / maxBin);

    // Golfer stats — effective mean/stddev for SimDetail display
    const golferStats = scoredEntries[e].golfers.map(g => {
      const prof = golferProfiles[g.name];
      if (!prof) return { name: g.name, mean: null, stddev: null, locked: false, status: g.status };
      // Effective mean includes MC probability pulling toward penalty
      const effMean = prof.locked ? prof.madeMean :
        prof.mcProb * prof.mcScore + (1 - prof.mcProb) * prof.madeMean;
      // Effective stddev from mixture variance
      const effStddev = prof.locked ? 0 : Math.sqrt(
        (1 - prof.mcProb) * prof.madeStddev * prof.madeStddev +
        prof.mcProb * 1.0 +
        prof.mcProb * (1 - prof.mcProb) * Math.pow(prof.mcScore - prof.madeMean, 2)
      );
      return {
        name: g.name,
        mean: parseFloat(effMean.toFixed(1)),
        stddev: parseFloat(effStddev.toFixed(1)),
        locked: prof.locked,
        status: g.status,
      };
    });

    details[id] = {
      winPct,
      median: parseFloat(median.toFixed(1)),
      bestCase: parseFloat(bestCase.toFixed(1)),
      worstCase: parseFloat(worstCase.toFixed(1)),
      p25: parseFloat(p25.toFixed(1)),
      p75: parseFloat(p75.toFixed(1)),
      histogram,
      histMin: parseFloat(min.toFixed(1)),
      histMax: parseFloat(max.toFixed(1)),
      golferStats,
    };
  }

  return { winProbabilities: result, simDetails: details };
}

export function formatScore(score) {
  if (score === null || score === undefined) return '--';
  if (score === 0) return 'E';
  if (score > 0) return `+${score}`;
  return `${score}`;
}
