import { matchGolfer } from './hooks/useGolfData';
import { matchOdds } from './hooks/useOdds';

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
const NUM_SIMS = 5000;

export function calcWinProbabilities(scoredEntries, oddsData) {
  if (!oddsData || Object.keys(oddsData).length === 0) return {};
  if (scoredEntries.length === 0) return {};

  // Get median implied prob for the expected score model
  const allProbs = Object.values(oddsData).map(o => o.impliedProb).filter(p => p > 0);
  if (allProbs.length === 0) return {};
  allProbs.sort((a, b) => a - b);
  const medianProb = allProbs[Math.floor(allProbs.length / 2)];

  function expectedScore(impliedProb) {
    if (impliedProb <= 0) return 8;
    return -4 * Math.log(impliedProb / medianProb);
  }

  // Build golfer profiles: mean + stddev for final score
  // Keyed by golfer name so shared picks get the same random draw
  const golferProfiles = {};

  for (const entry of scoredEntries) {
    for (const g of entry.golfers) {
      if (golferProfiles[g.name]) continue;

      if (g.status === 'cut' || g.status === 'wd') {
        golferProfiles[g.name] = { mean: g.score, stddev: 0, locked: true };
        continue;
      }

      const odds = matchOdds(g.name, oddsData);
      const projFromOdds = odds ? expectedScore(odds.impliedProb) : 4;

      let mean;
      if (g.score === null) {
        mean = projFromOdds;
      } else {
        mean = g.score * 0.6 + projFromOdds * 0.4;
      }

      // Stddev: favorites are more consistent, longshots more volatile
      // Also less variance as tournament progresses (score is more locked in)
      const baseStddev = odds ? Math.max(1.5, 4 - odds.impliedProb * 15) : 4;
      const progressFactor = g.score !== null ? 0.7 : 1.0;
      const stddev = baseStddev * progressFactor;

      golferProfiles[g.name] = { mean, stddev, locked: false };
    }
  }

  // Run Monte Carlo simulations
  const wins = {};
  for (const entry of scoredEntries) wins[entry.id] = 0;

  // Simple seeded random for reproducibility within a render
  let seed = 42;
  function rand() {
    seed = (seed * 16807 + 0) % 2147483647;
    return seed / 2147483647;
  }
  // Box-Muller for normal distribution
  function randNormal() {
    const u1 = rand();
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2);
  }

  for (let sim = 0; sim < NUM_SIMS; sim++) {
    // Draw a random final score for each unique golfer
    const golferScores = {};
    for (const [name, profile] of Object.entries(golferProfiles)) {
      if (profile.locked) {
        golferScores[name] = profile.mean;
      } else {
        golferScores[name] = profile.mean + profile.stddev * randNormal();
      }
    }

    // Score each entry: best 4 of 6
    let bestTotal = Infinity;
    const entryTotals = [];
    for (const entry of scoredEntries) {
      const scores = entry.golfers
        .map(g => golferScores[g.name] ?? 10)
        .sort((a, b) => a - b);
      const best4 = scores.slice(0, 4).reduce((s, v) => s + v, 0);
      entryTotals.push({ id: entry.id, total: best4 });
      if (best4 < bestTotal) bestTotal = best4;
    }

    // Count winners (handle ties: split credit)
    const winners = entryTotals.filter(e => Math.abs(e.total - bestTotal) < 0.01);
    const credit = 1 / winners.length;
    for (const w of winners) wins[w.id] += credit;
  }

  // Convert to percentages
  const result = {};
  for (const entry of scoredEntries) {
    result[entry.id] = parseFloat(((wins[entry.id] / NUM_SIMS) * 100).toFixed(1));
  }

  return result;
}

export function formatScore(score) {
  if (score === null || score === undefined) return '--';
  if (score === 0) return 'E';
  if (score > 0) return `+${score}`;
  return `${score}`;
}
