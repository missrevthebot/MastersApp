import { formatScore } from '../scoring';

function ScoreLabel({ value }) {
  const s = Math.round(value);
  return (
    <span className={`font-mono ${
      s < 0 ? 'text-active-blue' : s > 0 ? 'text-mc-red/70' : 'text-text-secondary/50'
    }`}>
      {formatScore(s)}
    </span>
  );
}

function HistogramBar({ height, isMedian }) {
  return (
    <div className="flex-1 flex flex-col justify-end h-12">
      <div
        className={`rounded-sm transition-all ${isMedian ? 'bg-gold/50' : 'bg-augusta-light/30'}`}
        style={{ height: `${Math.max(2, height * 100)}%` }}
      />
    </div>
  );
}

function GolferProjection({ golfer, best, worst }) {
  const isBest = golfer.name === best;
  const isWorst = golfer.name === worst;
  const locked = golfer.locked;

  // Map mean to a position on a visual bar (range roughly -20 to +20)
  const barMin = -20;
  const barMax = 20;
  const meanClamped = Math.max(barMin, Math.min(barMax, golfer.mean || 0));
  const pct = ((meanClamped - barMin) / (barMax - barMin)) * 100;

  // Width represents uncertainty (stddev)
  const spreadPct = Math.min(40, ((golfer.stddev || 0) / (barMax - barMin)) * 100);

  return (
    <div className="flex items-center gap-2 py-1.5">
      {/* Name */}
      <div className="w-24 flex-shrink-0">
        <span className={`text-[11px] truncate block ${
          golfer.status === 'cut' ? 'text-mc-red/50' :
          golfer.status === 'wd' ? 'text-wd-orange/50' :
          'text-text-primary/70'
        }`}>
          {golfer.name.split(' ').pop()}
        </span>
      </div>

      {/* Projection bar */}
      <div className="flex-1 h-3 bg-bg/50 rounded-full relative overflow-hidden">
        {/* Zero line */}
        <div className="absolute top-0 bottom-0 border-l border-text-secondary/10"
             style={{ left: `${((0 - barMin) / (barMax - barMin)) * 100}%` }} />

        {locked ? (
          // Locked: single dot
          <div className="absolute top-0.5 w-2 h-2 rounded-full bg-text-secondary/30"
               style={{ left: `calc(${pct}% - 4px)` }} />
        ) : (
          // Range bar + dot
          <>
            <div className={`absolute top-0.5 h-2 rounded-full ${
              isBest ? 'bg-active-blue/30' : isWorst ? 'bg-mc-red/20' : 'bg-augusta-light/20'
            }`}
                 style={{
                   left: `${Math.max(0, pct - spreadPct)}%`,
                   width: `${spreadPct * 2}%`,
                 }} />
            <div className={`absolute top-0 w-1 h-3 rounded-full ${
              isBest ? 'bg-active-blue' : isWorst ? 'bg-mc-red/60' : 'bg-gold/60'
            }`}
                 style={{ left: `calc(${pct}% - 2px)` }} />
          </>
        )}
      </div>

      {/* Projected score */}
      <div className="w-8 text-right text-[10px] font-mono flex-shrink-0">
        <ScoreLabel value={golfer.mean || 0} />
      </div>
    </div>
  );
}

export default function SimDetail({ entry, detail, onClose }) {
  if (!detail) return null;

  const { winPct, median, bestCase, worstCase, p25, p75, histogram, histMin, histMax, golferStats } = detail;

  // Find best and worst golfer (by mean projection)
  const activeSorted = [...golferStats].filter(g => !g.locked && g.mean !== null).sort((a, b) => a.mean - b.mean);
  const bestGolfer = activeSorted[0]?.name;
  const worstGolfer = activeSorted[activeSorted.length - 1]?.name;

  // Find which bin the median falls in
  const range = histMax - histMin || 1;
  const medianBin = Math.min(19, Math.floor(((median - histMin) / range) * 20));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm mx-auto bg-bg-card border border-augusta/12 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
        style={{ animation: 'sheetUp 0.25s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-8 h-0.5 rounded-full bg-text-secondary/15 mx-auto mt-3 sm:hidden" />

        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 text-text-secondary/30 hover:text-text-primary transition-colors z-10">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 1l12 12M13 1L1 13" />
          </svg>
        </button>

        {/* Header */}
        <div className="px-5 pt-5 pb-2">
          <h3 className="font-[Playfair_Display] text-base text-text-primary">{entry.name}</h3>
          <p className="text-[10px] text-text-secondary/35 mt-0.5 tracking-wide">
            Simulation Breakdown &middot; 25k runs
          </p>
        </div>

        {/* Win % hero number */}
        <div className="px-5 py-3 flex items-baseline gap-2">
          <span className={`font-mono text-3xl font-semibold ${
            winPct >= 20 ? 'text-gold' :
            winPct >= 8 ? 'text-active-blue' :
            winPct === 0 ? 'text-mc-red/50' :
            'text-text-primary/70'
          }`}>
            {winPct}%
          </span>
          <span className="text-[10px] text-text-secondary/30">chance to win</span>
        </div>

        {/* Distribution histogram */}
        <div className="px-5 pb-2">
          <div className="flex items-end gap-px">
            {histogram.map((h, i) => (
              <HistogramBar key={i} height={h} isMedian={i === medianBin} />
            ))}
          </div>
          <div className="flex justify-between text-[8px] text-text-secondary/20 font-mono mt-1">
            <span><ScoreLabel value={histMin} /></span>
            <span><ScoreLabel value={histMax} /></span>
          </div>
        </div>

        {/* Percentile range */}
        <div className="px-5 py-3">
          <div className="flex items-center justify-between text-[10px]">
            <div className="text-center">
              <div className="text-text-secondary/25 mb-0.5">Best 5%</div>
              <div className="font-mono text-sm"><ScoreLabel value={bestCase} /></div>
            </div>
            <div className="text-center">
              <div className="text-text-secondary/25 mb-0.5">Likely</div>
              <div className="font-mono text-sm"><ScoreLabel value={p25} /></div>
              <div className="text-[8px] text-text-secondary/15 font-mono">to <ScoreLabel value={p75} /></div>
            </div>
            <div className="text-center">
              <div className="text-gold/40 mb-0.5">Median</div>
              <div className="font-mono text-sm text-gold/70"><ScoreLabel value={median} /></div>
            </div>
            <div className="text-center">
              <div className="text-text-secondary/25 mb-0.5">Worst 5%</div>
              <div className="font-mono text-sm"><ScoreLabel value={worstCase} /></div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-augusta/8 mx-5" />

        {/* Golfer projections */}
        <div className="px-5 py-3">
          <div className="text-[9px] text-text-secondary/25 tracking-[0.12em] uppercase mb-2">
            Golfer Projections
          </div>
          {golferStats.map((g, i) => (
            <GolferProjection
              key={i}
              golfer={g}
              best={bestGolfer}
              worst={worstGolfer}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="px-5 pb-5">
          <div className="flex gap-3 justify-center text-[8px] text-text-secondary/20">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-active-blue" /> Carrying
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-mc-red/60" /> Dragging
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-1.5 rounded-full bg-augusta-light/20" /> Range
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
