import { useState } from 'react';
import { matchOdds } from '../hooks/useOdds';

function formatScore(score) {
  if (score === 0) return 'E';
  if (score > 0) return `+${score}`;
  return `${score}`;
}

function norm(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .replace(/ð/g, 'd').replace(/Ð/g, 'D')
    .toLowerCase().trim();
}

export default function TournamentLeaderboard({ golferData, oddsData, entries, onGolferClick }) {
  const [filter, setFilter] = useState('all');

  const golfers = Object.entries(golferData)
    .filter(([name]) => name.includes(' '))
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => {
      const statusOrder = { active: 0, cut: 1, wd: 2 };
      const aOrder = statusOrder[a.status] ?? 3;
      const bOrder = statusOrder[b.status] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      if (a.score !== b.score) return a.score - b.score;
      const aOdds = matchOdds(a.name, oddsData);
      const bOdds = matchOdds(b.name, oddsData);
      return (bOdds?.impliedProb ?? 0) - (aOdds?.impliedProb ?? 0);
    });

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
    const nextSameScore = filtered[i + 1]?.score === g.score && filtered[i + 1]?.status === 'active';
    return { ...g, displayPos: (tieCount > 0 || nextSameScore) ? `T${pos}` : `${pos}` };
  });

  return (
    <div className="space-y-3">
      {/* Filter */}
      <div className="flex gap-1.5 justify-center">
        <button
          onClick={() => setFilter('all')}
          className={`text-[11px] px-3 py-1.5 rounded-lg transition-all ${
            filter === 'all'
              ? 'bg-augusta/80 text-white'
              : 'text-text-secondary/40 hover:text-text-secondary/70'
          }`}
        >
          Full Field ({golfers.length})
        </button>
        <button
          onClick={() => setFilter('picked')}
          className={`text-[11px] px-3 py-1.5 rounded-lg transition-all ${
            filter === 'picked'
              ? 'bg-augusta/80 text-white'
              : 'text-text-secondary/40 hover:text-text-secondary/70'
          }`}
        >
          Pool Golfers ({golfers.filter(g => isPicked(g.name)).length})
        </button>
      </div>

      {/* Table */}
      <div className="bg-bg-card border border-augusta/10 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-4 py-2.5 text-[9px] text-text-secondary/30 uppercase tracking-[0.12em] border-b border-augusta/8">
          <span className="w-9 text-center">Pos</span>
          <span className="flex-1 ml-2">Player</span>
          <span className="w-8 text-right">Thru</span>
          <span className="w-14 text-right">Odds</span>
          <span className="w-11 text-right">Score</span>
        </div>

        <div>
          {withPos.map((g) => {
            const pickers = getPickerNames(g.name);
            const picked = pickers.length > 0;
            const odds = matchOdds(g.name, oddsData);
            const isCut = g.status === 'cut';
            const isWd = g.status === 'wd';
            const isLive = g.status === 'active' && g.thru && !g.thru.includes('F');

            return (
              <div key={g.name}
                className={`border-b border-augusta/[0.04] last:border-0 transition-colors
                  ${isCut ? 'opacity-40' : isWd ? 'opacity-35' : ''}
                `}
              >
                <div className={`flex items-center px-4 py-2 text-[12px]
                  ${picked ? 'bg-augusta/[0.04]' : ''}
                `}>
                  {/* Position */}
                  <span className={`w-9 text-center font-mono text-[11px] ${
                    g.displayPos === '1' ? 'text-gold font-semibold' :
                    isCut ? 'text-mc-red/60' :
                    isWd ? 'text-wd-orange/60' :
                    'text-text-secondary/40'
                  }`}>
                    {g.displayPos}
                  </span>

                  {/* Name */}
                  <div className="flex-1 ml-2 flex items-center gap-1.5 min-w-0">
                    {isLive && (
                      <span className="w-1 h-1 rounded-full bg-active-blue flex-shrink-0"
                            style={{ animation: 'livePulse 2s ease-in-out infinite' }} />
                    )}
                    <span
                      className={`truncate cursor-pointer hover:text-gold transition-colors ${
                        isCut ? 'text-mc-red/70' : isWd ? 'text-wd-orange/70' : 'text-text-primary'
                      }`}
                      onClick={() => onGolferClick?.(g.name)}
                    >
                      {g.name}
                    </span>
                  </div>

                  {/* Thru */}
                  <span className="w-8 text-right text-[10px] text-text-secondary/30 font-mono">
                    {g.status === 'active' ? (g.thru || '') : ''}
                  </span>

                  {/* Odds */}
                  <span className="w-14 text-right text-[10px] font-mono text-gold-dim/50">
                    {odds && g.status === 'active' ? odds.americanOdds : ''}
                  </span>

                  {/* Score */}
                  <span className={`w-11 text-right font-mono text-[13px] font-medium ${
                    g.score < 0 ? 'text-active-blue' :
                    g.score > 0 ? 'text-mc-red/70' :
                    'text-text-secondary/40'
                  }`}>
                    {formatScore(g.score)}
                  </span>
                </div>

                {/* Pickers */}
                {picked && (
                  <div className="ml-13 pl-4 pb-1.5 flex flex-wrap gap-1">
                    {pickers.map(name => (
                      <span key={name} className="text-[8px] text-gold-dim/40 tracking-wide">
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
