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
 * Convert outright win probability into an expected score contribution.
 *
 * The Odds API only offers outrights (winner market), not top-5/10/20 or totals.
 * But win probability is a strong proxy for expected finish position and score:
 *
 *   - A golfer with 15% win prob (Scheffler) is very likely to finish top 5
 *     and post something like -12 to -16.
 *   - A golfer with 0.5% win prob is likely to finish 30th-50th, maybe -2 to +4.
 *   - A golfer with 0.1% win prob will probably be near the cut line or MC.
 *
 * We model expected score as: -4 * ln(winProb / medianProb)
 * This gives roughly:
 *   15% → about -14,  5% → about -10,  1% → about -5,  0.3% → about 0
 *
 * For the pool win probability, we:
 * 1. Estimate each golfer's expected final score from odds
 * 2. Take the best 4 expected scores per entry
 * 3. Combine with actual current score (weighted by how far into the tournament we are)
 * 4. Run a simplified Monte Carlo: estimate variance and compute P(this entry wins)
 */
export function calcWinProbabilities(scoredEntries, oddsData) {
  if (!oddsData || Object.keys(oddsData).length === 0) return {};

  // Get all implied probs to find the median
  const allProbs = Object.values(oddsData).map(o => o.impliedProb).filter(p => p > 0);
  if (allProbs.length === 0) return {};
  allProbs.sort((a, b) => a - b);
  const medianProb = allProbs[Math.floor(allProbs.length / 2)];

  // Convert win% to expected score relative to par
  function expectedScore(impliedProb) {
    if (impliedProb <= 0) return 8; // longshot → expect near MC
    return -4 * Math.log(impliedProb / medianProb);
  }

  const entryProjections = [];

  for (const entry of scoredEntries) {
    const golferProjections = entry.golfers.map(g => {
      // MC/WD golfers are locked in at their penalty score
      if (g.status === 'cut' || g.status === 'wd') {
        return { locked: true, current: g.score, projected: g.score };
      }

      const odds = matchOdds(g.name, oddsData);
      const projFromOdds = odds ? expectedScore(odds.impliedProb) : 4;
      const current = g.score;

      // Blend current score with odds projection.
      // As tournament progresses, current score matters more.
      // Rough heuristic: weight current score by how "complete" it feels.
      // Before tournament: 100% odds. During: blend. After cut: mostly current.
      let projected;
      if (current === null) {
        projected = projFromOdds; // pre-tournament
      } else {
        // The further the current score is locked in, the more we trust it.
        // Use 60% current + 40% odds as a reasonable mid-tournament blend.
        projected = current * 0.6 + projFromOdds * 0.4;
      }

      return { locked: false, current, projected };
    });

    // Best 4 projected scores (lowest)
    const projScores = golferProjections.map(g => g.projected).sort((a, b) => a - b);
    const best4Proj = projScores.slice(0, 4).reduce((s, v) => s + v, 0);

    // Uncertainty: entries with more "unlocked" golfers have more variance
    const unlockedCount = golferProjections.filter(g => !g.locked).length;
    const uncertainty = Math.max(1, unlockedCount * 1.5); // std dev in strokes

    entryProjections.push({
      id: entry.id,
      projectedTotal: best4Proj,
      uncertainty,
    });
  }

  // Find the entry with the best (lowest) projected total
  const bestProj = Math.min(...entryProjections.map(e => e.projectedTotal));

  // For each entry, estimate probability of winning:
  // P(win) ≈ based on how likely they are to end up with the lowest total
  // Use a logistic/softmax-style approach: exp(-diff/uncertainty)
  const rawProbs = entryProjections.map(e => {
    const diff = e.projectedTotal - bestProj;
    // Temperature controls how quickly probability drops with strokes behind
    const temperature = Math.max(1.5, e.uncertainty);
    return { id: e.id, raw: Math.exp(-diff / temperature) };
  });

  const totalRaw = rawProbs.reduce((s, e) => s + e.raw, 0);
  if (totalRaw === 0) return {};

  const result = {};
  for (const e of rawProbs) {
    result[e.id] = parseFloat(((e.raw / totalRaw) * 100).toFixed(1));
  }

  return result;
}

export function formatScore(score) {
  if (score === null || score === undefined) return '--';
  if (score === 0) return 'E';
  if (score > 0) return `+${score}`;
  return `${score}`;
}
