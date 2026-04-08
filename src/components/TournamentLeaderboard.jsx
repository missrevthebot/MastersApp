import { useState } from 'react';
import { matchOdds } from '../hooks/useOdds';

function formatScore(score) {
  if (score === 0) return 'E';
  if (score > 0) return `+${score}`;
  return `${score}`;
}

/** Strip diacritics + Nordic chars for name matching */
function norm(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .replace(/ð/g, 'd').replace(/Ð/g, 'D')
    .toLowerCase().trim();
}

export default function TournamentLeaderboard({ golferData, oddsData, entries }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'picked'

  // Build sorted array of all golfers from ESPN data
  const golfers = Object.entries(golferData)
    .filter(([name]) => name.includes(' '))
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => {
      const statusOrder = { active: 0, cut: 1, wd: 2 };
      const aOrder = statusOrder[a.status] ?? 3;
      const bOrder = statusOrder[b.status] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      // Sort by score first
      if (a.score !== b.score) return a.score - b.score;
      // Tied score: better odds (higher implied prob) ranks first
      const aOdds = matchOdds(a.name, oddsData);
      const bOdds = matchOdds(b.name, oddsData);
      const aProb = aOdds?.impliedProb ?? 0;
      const bProb = bOdds?.impliedProb ?? 0;
      return bProb - aProb; // higher prob first
    });

  // Build a map: golfer name -> list of entry names who picked them
  function getPickerNames(golferName) {
    const golferNorm = norm(golferName);
    const golferLast = golferNorm.split(' ').pop();
    const pickers = [];
    for (const entry of entries) {
      for (const pick of entry.picks) {
        const pickNorm = norm(pick.replace(/\s*\(.*?\)\s*$/, ''));
        const pickLast = pickNorm.split(' ').pop();
        if (pickNorm === golferNorm || (pickLast === golferLast && pickNorm[0] === golferNorm[0])) {
          pickers.push(entry.name);
          break;
        }
      }
    }
    return pickers;
  }

  function isPicked(name) {
    return getPickerNames(name).length > 0;
  }

  const filtered = filter === 'picked'
    ? golfers.filter(g => isPicked(g.name))
    : golfers;

  // Assign positions — tied scores get same position with T prefix
  let pos = 0;
  let lastScore = null;
  let tieCount = 0;
  const withPos = filtered.map((g, i) => {
    if (g.status !== 'active') return { ...g, displayPos: g.status === 'cut' ? 'MC' : 'WD' };
    if (g.score !== lastScore) {
      pos = pos + 1 + tieCount;
      tieCount = 0;
      lastScore = g.score;
    } else {
      tieCount++;
    }
    // Check if anyone after us at same score (to decide T prefix)
    const nextSameScore = filtered[i + 1]?.score === g.score && filtered[i + 1]?.status === 'active';
    return { ...g, displayPos: (tieCount > 0 || nextSameScore) ? `T${pos}` : `${pos}` };
  });

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex gap-2 justify-center">
        <button
          onClick={() => setFilter('all')}
          className={`text-xs px-3 py-1.5 rounded transition-colors ${
            filter === 'all'
              ? 'bg-augusta text-white'
              : 'bg-bg-card border border-augusta/20 text-text-secondary hover:text-text-primary'
          }`}
        >
          Full Field ({golfers.length})
        </button>
        <button
          onClick={() => setFilter('picked')}
          className={`text-xs px-3 py-1.5 rounded transition-colors ${
            filter === 'picked'
              ? 'bg-augusta text-white'
              : 'bg-bg-card border border-augusta/20 text-text-secondary hover:text-text-primary'
          }`}
        >
          Our Golfers ({golfers.filter(g => isPicked(g.name)).length})
        </button>
      </div>

      {/* Table */}
      <div className="bg-bg-card border border-augusta/20 rounded-lg overflow-hidden">
        <div className="flex items-center px-3 py-2 text-[9px] text-text-secondary/50 uppercase tracking-wider border-b border-augusta/10">
          <span className="w-10 text-center">Pos</span>
          <span className="flex-1 ml-2">Golfer</span>
          <span className="w-10 text-right">Thru</span>
          <span className="w-14 text-right">Odds</span>
          <span className="w-12 text-right">Score</span>
        </div>

        <div className="divide-y divide-augusta/5">
          {withPos.map((g) => {
            const pickers = getPickerNames(g.name);
            const picked = pickers.length > 0;
            const odds = matchOdds(g.name, oddsData);
            const isCut = g.status === 'cut';
            const isWd = g.status === 'wd';

            return (
              <div key={g.name}
                className={`px-3 py-1.5 transition-colors
                  ${picked ? 'bg-augusta/8' : ''}
                  ${isCut ? 'opacity-50' : ''}
                  ${isWd ? 'opacity-40' : ''}
                `}
              >
                {/* Main row */}
                <div className="flex items-center text-xs">
                  {/* Position */}
                  <span className={`w-10 text-center font-mono text-[11px] ${
                    g.displayPos === '1' ? 'text-gold font-bold' :
                    isCut ? 'text-mc-red' :
                    isWd ? 'text-wd-orange' :
                    'text-text-secondary'
                  }`}>
                    {g.displayPos}
                  </span>

                  {/* Name */}
                  <div className="flex-1 ml-2 flex items-center gap-1.5 min-w-0">
                    {g.status === 'active' && g.thru && !g.thru.includes('F') && (
                      <span className="w-1.5 h-1.5 rounded-full bg-active-blue flex-shrink-0"
                            style={{ animation: 'livePulse 2s ease-in-out infinite' }} />
                    )}
                    <span className={`truncate ${
                      isCut ? 'text-mc-red' : isWd ? 'text-wd-orange' : 'text-text-primary'
                    }`}>
                      {g.name}
                    </span>
                    {isCut && (
                      <span className="text-[8px] bg-mc-red/20 text-mc-red px-1 py-0.5 rounded flex-shrink-0">MC</span>
                    )}
                    {isWd && (
                      <span className="text-[8px] bg-wd-orange/20 text-wd-orange px-1 py-0.5 rounded flex-shrink-0">WD</span>
                    )}
                  </div>

                  {/* Thru */}
                  <span className="w-10 text-right text-[10px] text-text-secondary/50">
                    {g.status === 'active' ? (g.thru || '') : ''}
                  </span>

                  {/* Odds */}
                  <span className="w-14 text-right text-[10px] font-mono text-gold-dim">
                    {odds && g.status === 'active' ? odds.americanOdds : ''}
                  </span>

                  {/* Score */}
                  <span className={`w-12 text-right font-mono text-sm font-semibold ${
                    g.score < 0 ? 'text-green-400' :
                    g.score > 0 ? 'text-red-400' :
                    'text-text-secondary'
                  }`}>
                    {formatScore(g.score)}
                  </span>
                </div>

                {/* Picker names row */}
                {picked && (
                  <div className="ml-12 mt-0.5 flex flex-wrap gap-1">
                    {pickers.map(name => (
                      <span key={name} className="text-[8px] bg-gold/10 text-gold/80 px-1.5 py-0.5 rounded">
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
