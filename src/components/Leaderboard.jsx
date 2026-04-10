import { useState, useEffect, useRef } from 'react';
import { formatScore } from '../scoring';
import { matchOdds } from '../hooks/useOdds';
import SimDetail from './SimDetail';

const PREV_RANKS_KEY = 'masters-prev-ranks';

/**
 * Detect momentum from a golfer's most recent holes.
 * Returns 'hot' (2+ under in last 4), 'cold' (2+ over in last 4), or null.
 */
function getMomentum(golfer, golferData) {
  const data = golferData?.[golfer.name];
  if (!data?.rounds?.length) return null;
  const lastRound = data.rounds[data.rounds.length - 1];
  const holes = lastRound?.holes || [];
  if (holes.length < 3) return null;

  // Augusta pars
  const PARS = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4];
  const recent = holes.slice(-4);
  let total = 0;
  for (const h of recent) {
    total += h.strokes - PARS[h.hole - 1];
  }
  if (total <= -2) return 'hot';
  if (total >= 2) return 'cold';
  return null;
}

function GolferRow({ golfer, isDropped, oddsData, onGolferClick, golferData }) {
  const odds = matchOdds(golfer.name, oddsData);
  const isCut = golfer.status === 'cut';
  const isWd = golfer.status === 'wd';
  const isLive = golfer.status === 'active' && golfer.thru && !golfer.thru.includes('F');
  const momentum = !isDropped && golfer.status === 'active' ? getMomentum(golfer, golferData) : null;

  return (
    <div className={`flex items-center justify-between py-2 px-3 text-[12px]
      ${isDropped ? 'opacity-30' : ''}
    `}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {isLive && !isDropped && (
          <span className="w-1 h-1 rounded-full bg-active-blue flex-shrink-0"
                style={{ animation: 'livePulse 2s ease-in-out infinite' }} />
        )}
        <span
          className={`truncate cursor-pointer hover:text-gold transition-colors ${
            isCut ? 'text-mc-red/80' : isWd ? 'text-wd-orange/80' : 'text-text-primary'
          } ${isDropped ? 'line-through' : ''}`}
          onClick={(e) => { e.stopPropagation(); onGolferClick?.(golfer.name); }}
        >
          {golfer.name.replace(/\s*\(.*?\)$/, '')}
        </span>
        {isCut && (
          <span className="text-[8px] text-mc-red/60 font-medium tracking-wide">MC</span>
        )}
        {isWd && (
          <span className="text-[8px] text-wd-orange/60 font-medium tracking-wide">WD</span>
        )}
        {/* Momentum */}
        {momentum === 'hot' && (
          <span className="text-[9px] text-active-blue/70 flex-shrink-0" title="Hot — recent birdies">↑</span>
        )}
        {momentum === 'cold' && (
          <span className="text-[9px] text-mc-red/50 flex-shrink-0" title="Cold — recent bogeys">↓</span>
        )}
      </div>

      <div className="flex items-center gap-3 ml-3 flex-shrink-0 text-[11px]">
        {golfer.thru && golfer.status === 'active' && (
          <span className="text-text-secondary/35 font-mono w-5 text-right text-[10px]">
            {golfer.thru}
          </span>
        )}
        {odds && !isDropped && golfer.status === 'active' && (
          <span className="text-gold-dim/60 font-mono w-12 text-right text-[10px]">
            {odds.americanOdds}
          </span>
        )}
        <span className={`font-mono font-medium w-8 text-right ${
          golfer.score !== null && golfer.score < 0 ? 'text-active-blue' :
          golfer.score !== null && golfer.score > 0 ? 'text-mc-red/80' :
          'text-text-secondary/50'
        }`}>
          {golfer.displayScore}
        </span>
      </div>
    </div>
  );
}

function EntryCard({ entry, expanded, onToggle, isLeader, oddsData, winProb, rank, onGolferClick, onSimClick, rankDelta, pot, golferData, magicNumber }) {
  const droppedNames = new Set();
  if (entry.drops?.length > 0) {
    const sortedGolfers = [...entry.golfers]
      .filter(g => g.score !== null)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aOdds = matchOdds(a.name, oddsData);
        const bOdds = matchOdds(b.name, oddsData);
        return (aOdds?.impliedProb ?? 0) - (bOdds?.impliedProb ?? 0);
      });
    for (let i = 0; i < entry.drops.length && i < sortedGolfers.length; i++) {
      droppedNames.add(sortedGolfers[i].name);
    }
  }

  const hasOdds = Object.keys(oddsData || {}).length > 0;
  const isElim = winProb === 0 && hasOdds; // truly 0 sims won
  const isSubOne = winProb === -1; // has wins but rounds to 0%
  const expectedPayout = hasOdds && (winProb > 0 || isSubOne) ? ((Math.max(winProb, 0.5) / 100) * pot).toFixed(0) : null;

  return (
    <div
      className={`rounded-xl border transition-all duration-150 cursor-pointer
        ${isLeader
          ? 'border-gold/25 bg-bg-card shadow-sm shadow-gold/5'
          : isElim
          ? 'border-augusta/10 bg-bg-card/50 opacity-60'
          : 'border-augusta/12 bg-bg-card hover:border-augusta/25'}
      `}
      style={{ animation: 'fadeIn 0.3s ease-out both' }}
      onClick={onToggle}
    >
      {/* Main row */}
      <div className="flex items-center px-4 py-3.5">
        {/* Rank + delta */}
        <div className="w-8 flex-shrink-0 text-center">
          <div className={`font-mono text-sm
            ${isLeader ? 'text-gold font-semibold' : 'text-text-secondary/40'}
          `}>
            {rank}
          </div>
          {rankDelta !== 0 && rankDelta != null && (
            <div className={`text-[8px] font-mono leading-none mt-0.5 ${
              rankDelta > 0 ? 'text-active-blue' : 'text-mc-red/60'
            }`}>
              {rankDelta > 0 ? `↑${rankDelta}` : `↓${Math.abs(rankDelta)}`}
            </div>
          )}
        </div>

        {/* Name + golfer previews */}
        <div className="flex-1 min-w-0 ml-2">
          <div className="flex items-center gap-2">
            <span className={`font-medium text-[13px] truncate
              ${isLeader ? 'text-gold' : 'text-text-primary'}
            `}>
              {entry.name}
            </span>
            {hasOdds && winProb !== undefined && (
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded-md flex-shrink-0 cursor-pointer hover:ring-1 hover:ring-gold/20 transition-all flex items-center gap-1.5
                  ${isElim ? 'text-mc-red/50' :
                    isSubOne ? 'text-text-secondary/30' :
                    winProb >= 20 ? 'bg-gold/10 text-gold/90' :
                    winProb >= 8 ? 'bg-augusta/10 text-active-blue/80' :
                    'text-text-secondary/40'}
                `}
                onClick={(e) => { e.stopPropagation(); onSimClick?.(); }}
                title="View simulation breakdown"
              >
                {isElim ? 'ELIM' : isSubOne ? '<1%' : `${winProb}%`}
                {expectedPayout && parseInt(expectedPayout) > 0 && (
                  <span className="text-gold-dim/40">${expectedPayout}</span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {!expanded && (
              <div className="flex gap-1.5">
                {entry.golfers.map((g, i) => (
                  <span key={i} className={`text-[9px] tracking-wide
                    ${droppedNames.has(g.name) ? 'opacity-20 line-through' : ''}
                    ${g.status === 'cut' ? 'text-mc-red/40' : g.status === 'wd' ? 'text-wd-orange/40' : 'text-text-secondary/35'}
                  `}>
                    {g.name.split(' ').pop()}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Score */}
        <div className="text-right flex-shrink-0 ml-3">
          <div className={`font-mono text-lg font-semibold
            ${entry.best4Total !== null && entry.best4Total < 0 ? 'text-active-blue' :
              entry.best4Total !== null && entry.best4Total > 0 ? 'text-mc-red/80' :
              'text-text-primary/70'}
          `}>
            {formatScore(entry.best4Total)}
          </div>
        </div>

        {/* Expand indicator */}
        <div className="ml-2 text-text-secondary/20 text-[10px] flex-shrink-0 transition-transform duration-150"
             style={{ transform: expanded ? 'rotate(180deg)' : '' }}>
          ▼
        </div>
      </div>

      {/* Magic number — only shows in expanded view on Sunday */}
      {expanded && magicNumber !== null && (
        <div className="px-4 pb-2 text-[10px] text-gold-dim/40">
          {magicNumber <= 0
            ? <span className="text-gold/70">Clinched if standings hold</span>
            : <span>Needs {magicNumber} stroke{magicNumber !== 1 ? 's' : ''} to clinch</span>
          }
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-augusta/8 py-1">
          {entry.golfers.map((g, i) => (
            <GolferRow key={i} golfer={g} isDropped={droppedNames.has(g.name)} oddsData={oddsData} onGolferClick={onGolferClick} golferData={golferData} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModelExplainer({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm mx-auto bg-bg-card border border-augusta/15 rounded-t-2xl sm:rounded-2xl px-6 pt-6 pb-8 shadow-2xl"
        style={{ animation: 'sheetUp 0.25s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-8 h-0.5 rounded-full bg-text-secondary/15 mx-auto mb-5 sm:hidden" />
        <button onClick={onClose} className="absolute top-4 right-4 text-text-secondary/30 hover:text-text-primary transition-colors">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 1l12 12M13 1L1 13" />
          </svg>
        </button>

        <h3 className="font-[Playfair_Display] text-sm text-text-primary mb-5">How Win % Works</h3>

        <div className="space-y-4 text-[11px] leading-[1.6] text-text-secondary/70">
          <div className="flex gap-3">
            <span className="text-gold/60 text-[10px] font-mono mt-px flex-shrink-0 w-3 text-right">1</span>
            <p>
              <span className="text-text-primary/80">Each golfer gets a projected final score</span> — a blend
              of live betting odds and actual tournament score. Early on, odds dominate. By Sunday, it's almost
              entirely real scores.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-gold/60 text-[10px] font-mono mt-px flex-shrink-0 w-3 text-right">2</span>
            <p>
              <span className="text-text-primary/80">25,000 simulations run.</span> Each one randomizes every
              golfer's final score around their projection. Shared picks move together across entries.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-gold/60 text-[10px] font-mono mt-px flex-shrink-0 w-3 text-right">3</span>
            <p>
              <span className="text-text-primary/80">Best 4 of 6 scoring</span> is applied each sim. Cut and
              withdrawn golfers lock at the penalty score.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-gold/60 text-[10px] font-mono mt-px flex-shrink-0 w-3 text-right">4</span>
            <p>
              <span className="text-text-primary/80">Win % = your share of first-place finishes.</span> Flat
              early, sharp by Sunday. ELIM = mathematically eliminated (zero winning sims).
            </p>
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-augusta/8 text-[9px] text-text-secondary/25 text-center tracking-[0.15em] uppercase">
          Updates live with scores & odds
        </div>
      </div>
    </div>
  );
}

/**
 * Calculate magic numbers for Sunday.
 * Magic number = how many strokes the leader needs to gain on 2nd place to clinch.
 * For non-leaders: strokes they need to make up to overtake 1st.
 */
function calcMagicNumbers(scoredEntries) {
  if (scoredEntries.length < 2) return {};
  const leader = scoredEntries[0];
  if (leader.best4Total === null) return {};

  const result = {};
  const secondBest = scoredEntries.find((e, i) => i > 0 && e.best4Total !== null);
  if (!secondBest) return {};

  for (const entry of scoredEntries) {
    if (entry.best4Total === null) continue;
    if (entry.id === leader.id) {
      // Leader: strokes of margin over 2nd (0 = tied, negative = already ahead)
      result[entry.id] = secondBest.best4Total - entry.best4Total;
    } else {
      // Others: strokes behind the leader
      result[entry.id] = entry.best4Total - leader.best4Total;
    }
  }
  return result;
}

export default function Leaderboard({ scoredEntries, mcPenalty, oddsData, winProbabilities, simDetails, onGolferClick, golferData }) {
  const [expandedId, setExpandedId] = useState(null);
  const [sortBy, setSortBy] = useState('score');
  const [showExplainer, setShowExplainer] = useState(false);
  const [simEntryId, setSimEntryId] = useState(null);
  const [prevRanks, setPrevRanks] = useState(() => {
    try {
      const saved = localStorage.getItem(PREV_RANKS_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const hasStoredRanks = useRef(false);

  // Store current ranks after a delay so we can show deltas on next refresh
  useEffect(() => {
    if (scoredEntries.length === 0) return;
    // Build current rank map
    const currentRanks = {};
    for (const entry of scoredEntries) {
      currentRanks[entry.id] = entry.rank;
    }
    // Only store after first render so we compare against previous session
    if (hasStoredRanks.current) {
      const timer = setTimeout(() => {
        localStorage.setItem(PREV_RANKS_KEY, JSON.stringify(currentRanks));
      }, 30000); // Store after 30s so the delta shows for a bit
      return () => clearTimeout(timer);
    } else {
      hasStoredRanks.current = true;
      // Store immediately on first load if nothing saved
      if (Object.keys(prevRanks).length === 0) {
        localStorage.setItem(PREV_RANKS_KEY, JSON.stringify(currentRanks));
        setPrevRanks(currentRanks);
      }
    }
  }, [scoredEntries]);

  if (scoredEntries.length === 0) {
    return (
      <div className="text-center py-20 text-text-secondary/50">
        <p className="font-[Playfair_Display] text-base">No entries yet</p>
      </div>
    );
  }

  const hasWinProbs = winProbabilities && Object.keys(winProbabilities).length > 0;
  const pot = scoredEntries.length * 10;

  // Elimination counter
  const aliveCount = hasWinProbs
    ? Object.values(winProbabilities).filter(p => p > 0 || p === -1).length
    : scoredEntries.length;
  const elimCount = scoredEntries.length - aliveCount;

  // Magic numbers (show in R3/R4 when meaningful)
  const magicNumbers = calcMagicNumbers(scoredEntries);

  // Determine if we should show magic numbers (late tournament only)
  const anyOnSunday = scoredEntries.some(e =>
    e.golfers.some(g => parseInt(g.currentRound) >= 3)
  );

  const sorted = [...scoredEntries];
  if (sortBy === 'win' && hasWinProbs) {
    // -1 means <1% (still alive), sort above 0 (eliminated)
    const winVal = (id) => { const v = winProbabilities[id] || 0; return v === -1 ? 0.01 : v; };
    sorted.sort((a, b) => winVal(b.id) - winVal(a.id));
  }

  return (
    <div className="space-y-2">
      {/* Pot + leader callout */}
      <div className="text-center mb-1">
        <span className="text-gold font-mono font-semibold text-base">${pot}</span>
        <span className="text-text-secondary/30 text-[10px] ml-1.5 tracking-[0.15em] uppercase">pot</span>
      </div>

      {/* Elimination counter */}
      {hasWinProbs && elimCount > 0 && (
        <div className="text-center text-[9px] text-text-secondary/25 tracking-[0.1em] uppercase mb-1">
          {aliveCount} of {scoredEntries.length} still alive
        </div>
      )}

      {/* Controls row */}
      <div className="flex items-center justify-center gap-1.5 mb-3">
        {hasWinProbs && (
          <>
            <button
              onClick={() => setSortBy('score')}
              className={`text-[11px] px-3 py-1.5 rounded-lg transition-all ${
                sortBy === 'score'
                  ? 'bg-augusta/80 text-white'
                  : 'text-text-secondary/40 hover:text-text-secondary/70'
              }`}
            >
              Score
            </button>
            <button
              onClick={() => setSortBy('win')}
              className={`text-[11px] px-3 py-1.5 rounded-lg transition-all ${
                sortBy === 'win'
                  ? 'bg-augusta/80 text-white'
                  : 'text-text-secondary/40 hover:text-text-secondary/70'
              }`}
            >
              Win %
            </button>
            <button
              onClick={() => setShowExplainer(true)}
              className="w-5 h-5 rounded-full border border-gold/25 text-gold/50 hover:text-gold hover:border-gold/50 text-[10px] font-serif italic transition-all flex items-center justify-center ml-1"
            >
              ?
            </button>
          </>
        )}
      </div>

      {/* Metadata line */}
      <div className="text-center text-[9px] text-text-secondary/25 mb-3 tracking-[0.1em] uppercase">
        Best 4 of 6 &middot; MC Penalty {formatScore(mcPenalty)}
      </div>

      {/* Entry cards */}
      <div className="space-y-1.5">
        {sorted.map((entry, i) => {
          const currentRank = sortBy === 'win' ? i + 1 : entry.rank;
          const prevRank = prevRanks[entry.id];
          const rankDelta = prevRank != null ? prevRank - currentRank : 0;

          return (
            <EntryCard
              key={entry.id}
              entry={entry}
              rank={currentRank}
              rankDelta={rankDelta}
              expanded={expandedId === entry.id}
              onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              isLeader={sortBy === 'score'
                ? entry.rank === 1
                : (winProbabilities[entry.id] || 0) === Math.max(...Object.values(winProbabilities))}
              oddsData={oddsData}
              winProb={winProbabilities[entry.id]}
              onGolferClick={onGolferClick}
              onSimClick={() => setSimEntryId(entry.id)}
              pot={pot}
              golferData={golferData}
              magicNumber={anyOnSunday ? (magicNumbers[entry.id] ?? null) : null}
            />
          );
        })}
      </div>

      {showExplainer && <ModelExplainer onClose={() => setShowExplainer(false)} />}

      {simEntryId && simDetails?.[simEntryId] && (
        <SimDetail
          entry={sorted.find(e => e.id === simEntryId) || scoredEntries.find(e => e.id === simEntryId)}
          detail={simDetails[simEntryId]}
          onClose={() => setSimEntryId(null)}
        />
      )}
    </div>
  );
}
