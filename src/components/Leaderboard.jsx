import { useState } from 'react';
import { formatScore } from '../scoring';
import { matchOdds } from '../hooks/useOdds';

function GolferBadge({ golfer, isDropped, oddsData }) {
  const statusColors = {
    active: 'text-text-primary',
    cut: 'text-mc-red',
    wd: 'text-wd-orange',
    unknown: 'text-text-secondary',
  };

  const statusLabels = {
    cut: 'MC',
    wd: 'WD',
  };

  const odds = matchOdds(golfer.name, oddsData);

  return (
    <div className={`flex items-center justify-between py-1.5 px-2 rounded text-xs
      ${isDropped ? 'opacity-40 line-through' : ''}
      ${golfer.status === 'cut' ? 'bg-mc-red/5' : ''}
      ${golfer.status === 'wd' ? 'bg-wd-orange/5' : ''}
    `}>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {golfer.status === 'active' && golfer.thru && !golfer.thru.includes('F') && (
          <span className="w-1.5 h-1.5 rounded-full bg-active-blue flex-shrink-0"
                style={{ animation: 'livePulse 2s ease-in-out infinite' }} />
        )}
        <span className={`truncate ${statusColors[golfer.status]}`}>
          {golfer.name.replace(/\s*\(.*?\)$/, '')}
        </span>
        {statusLabels[golfer.status] && (
          <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${
            golfer.status === 'cut' ? 'bg-mc-red/20 text-mc-red' : 'bg-wd-orange/20 text-wd-orange'
          }`}>
            {statusLabels[golfer.status]}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
        {/* Tournament position */}
        {golfer.position && golfer.status === 'active' && (
          <span className="text-[9px] text-text-secondary/60 font-mono">
            {golfer.position}
          </span>
        )}
        {/* Thru indicator */}
        {golfer.thru && golfer.status === 'active' && (
          <span className="text-[9px] text-text-secondary/40 w-6 text-right">
            {golfer.thru}
          </span>
        )}
        {/* Odds */}
        {odds && !isDropped && golfer.status === 'active' && (
          <span className="text-[9px] text-gold-dim font-mono w-14 text-right"
                title={`Best: ${odds.bestOdds} (${odds.bestBook}) | Win prob: ${odds.impliedProb}%`}>
            {odds.americanOdds}
          </span>
        )}
        {/* Score */}
        <span className={`font-mono text-xs font-medium w-8 text-right ${
          golfer.score !== null && golfer.score < 0 ? 'text-green-400' :
          golfer.score !== null && golfer.score > 0 ? 'text-red-400' :
          'text-text-secondary'
        }`}>
          {golfer.displayScore}
        </span>
      </div>
    </div>
  );
}

function EntryCard({ entry, expanded, onToggle, isLeader, oddsData, winProb }) {
  // Figure out which 2 golfers are "dropped" (worst scores, not counted in best 4).
  // Sort worst score first. On tied scores, drop the golfer with LOWER odds
  // (worse implied probability) so we keep the better golfer in our best 4.
  const droppedNames = new Set();
  if (entry.drops?.length > 0) {
    const sortedGolfers = [...entry.golfers]
      .filter(g => g.score !== null)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score; // worst score first
        // Tied score: drop the one with lower win probability (worse golfer)
        const aOdds = matchOdds(a.name, oddsData);
        const bOdds = matchOdds(b.name, oddsData);
        const aProb = aOdds?.impliedProb ?? 0;
        const bProb = bOdds?.impliedProb ?? 0;
        return aProb - bProb; // lower prob first = dropped first
      });
    for (let i = 0; i < entry.drops.length && i < sortedGolfers.length; i++) {
      droppedNames.add(sortedGolfers[i].name);
    }
  }

  const hasOdds = Object.keys(oddsData || {}).length > 0;

  return (
    <div
      className={`rounded-lg border transition-all duration-200 cursor-pointer
        ${isLeader
          ? 'border-gold/40 bg-gradient-to-br from-bg-card to-augusta/10 shadow-lg shadow-gold/5'
          : 'border-augusta/20 bg-bg-card hover:bg-bg-card-hover hover:border-augusta/30'}
      `}
      onClick={onToggle}
    >
      {/* Main row */}
      <div className="flex items-center px-3 sm:px-4 py-3">
        {/* Rank */}
        <div className={`w-8 sm:w-10 text-center font-mono text-lg font-bold flex-shrink-0
          ${isLeader ? 'text-gold' : 'text-text-secondary'}
        `}>
          {entry.rank === 1 && <span className="text-gold">&#9971;</span>}
          {entry.rank !== 1 && entry.rank}
        </div>

        {/* Name + mini golfer names */}
        <div className="flex-1 min-w-0 ml-2">
          <div className="flex items-center gap-2">
            <span className={`font-semibold text-sm sm:text-base truncate
              ${isLeader ? 'text-gold' : 'text-text-primary'}
            `}>
              {entry.name}
            </span>
            {/* Win probability badge */}
            {hasOdds && winProb !== undefined && winProb > 0 && (
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0
                ${winProb >= 25 ? 'bg-gold/20 text-gold' :
                  winProb >= 10 ? 'bg-augusta/20 text-green-400' :
                  'bg-bg text-text-secondary/60'}
              `}>
                {winProb}%
              </span>
            )}
          </div>
          {!expanded && (
            <div className="flex gap-1 mt-0.5 overflow-hidden">
              {entry.golfers.map((g, i) => (
                <span key={i} className={`text-[9px] px-1 py-0.5 rounded
                  ${droppedNames.has(g.name) ? 'opacity-30 line-through' : ''}
                  ${g.status === 'cut' ? 'text-mc-red/80' : g.status === 'wd' ? 'text-wd-orange/80' : 'text-text-secondary'}
                `}>
                  {g.name.split(' ').pop()}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Score */}
        <div className={`text-right flex-shrink-0 ml-2 ${isLeader ? 'text-gold' : ''}`}>
          <div className={`font-mono text-xl sm:text-2xl font-bold
            ${entry.best4Total !== null && entry.best4Total < 0 ? 'text-green-400' :
              entry.best4Total !== null && entry.best4Total > 0 ? 'text-red-400' :
              'text-text-primary'}
          `}>
            {formatScore(entry.best4Total)}
          </div>
          <div className="text-[10px] text-text-secondary">Best 4</div>
        </div>

        {/* Expand */}
        <div className="ml-2 text-text-secondary text-xs flex-shrink-0">
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {/* Expanded golfer details */}
      {expanded && (
        <div className="border-t border-augusta/10 px-3 sm:px-4 py-2 space-y-0.5">
          {/* Column headers */}
          <div className="flex items-center justify-between px-2 pb-1 text-[8px] text-text-secondary/40 uppercase tracking-wider">
            <span>Golfer</span>
            <div className="flex items-center gap-2">
              <span className="w-6 text-right">Pos</span>
              <span className="w-6 text-right">Thru</span>
              {hasOdds && <span className="w-14 text-right">Odds</span>}
              <span className="w-8 text-right">Score</span>
            </div>
          </div>
          {entry.golfers.map((g, i) => (
            <GolferBadge key={i} golfer={g} isDropped={droppedNames.has(g.name)} oddsData={oddsData} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Leaderboard({ scoredEntries, mcPenalty, oddsData, winProbabilities }) {
  const [expandedId, setExpandedId] = useState(null);

  if (scoredEntries.length === 0) {
    return (
      <div className="text-center py-16 text-text-secondary">
        <div className="text-4xl mb-3">⛳</div>
        <p className="font-[Playfair_Display] text-lg">No entries yet</p>
        <p className="text-sm mt-1 opacity-70">Add entries in the admin panel to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Info banner */}
      <div className="text-center text-[10px] text-text-secondary mb-3 tracking-wide uppercase">
        MC Penalty: {formatScore(mcPenalty)} &nbsp;·&nbsp; Pick 6, Use Best 4 &nbsp;·&nbsp; Tap entry for details
      </div>

      {scoredEntries.map(entry => (
        <EntryCard
          key={entry.id}
          entry={entry}
          expanded={expandedId === entry.id}
          onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
          isLeader={entry.rank === 1}
          oddsData={oddsData}
          winProb={winProbabilities[entry.id]}
        />
      ))}
    </div>
  );
}
