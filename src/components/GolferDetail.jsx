import { useState } from 'react';
import { matchOdds } from '../hooks/useOdds';

// Augusta National par for each hole (never changes)
const AUGUSTA_PAR = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4];
const FRONT_PAR = AUGUSTA_PAR.slice(0, 9).reduce((a, b) => a + b, 0); // 36
const BACK_PAR = AUGUSTA_PAR.slice(9).reduce((a, b) => a + b, 0);     // 36
const TOTAL_PAR = 72;

// Augusta hole names
const HOLE_NAMES = [
  'Tea Olive', 'Pink Dogwood', 'Flowering Peach', 'Flowering Crab Apple',
  'Magnolia', 'Juniper', 'Pampas', 'Yellow Jasmine', 'Carolina Cherry',
  'Camellia', 'White Dogwood', 'Golden Bell', 'Azalea', 'Chinese Fir',
  'Firethorn', 'Redbud', 'Nandina', 'Holly'
];

function scoreColor(strokes, par) {
  const diff = strokes - par;
  if (diff <= -2) return 'bg-active-blue/20 text-active-blue';       // eagle+
  if (diff === -1) return 'bg-active-blue/8 text-active-blue/80';    // birdie
  if (diff === 0) return 'text-text-secondary/50';                     // par
  if (diff === 1) return 'bg-mc-red/8 text-mc-red/70';               // bogey
  return 'bg-mc-red/15 text-mc-red';                                   // double+
}

function scoreName(strokes, par) {
  const diff = strokes - par;
  if (diff <= -3) return 'Albatross';
  if (diff === -2) return 'Eagle';
  if (diff === -1) return 'Birdie';
  if (diff === 0) return 'Par';
  if (diff === 1) return 'Bogey';
  if (diff === 2) return 'Double';
  return `+${diff}`;
}

export default function GolferDetail({ golferName, golferData, oddsData, onClose }) {
  const data = golferData[golferName];
  if (!data) return null;

  const rounds = data.rounds || [];
  const [activeRound, setActiveRound] = useState(rounds.length > 0 ? rounds.length - 1 : 0);
  const odds = matchOdds(golferName, oddsData);

  const currentRoundData = rounds[activeRound];
  const holes = currentRoundData?.holes || [];

  // Calculate round stats
  const frontNine = holes.filter(h => h.hole <= 9);
  const backNine = holes.filter(h => h.hole > 9);
  const frontStrokes = frontNine.reduce((s, h) => s + h.strokes, 0);
  const backStrokes = backNine.reduce((s, h) => s + h.strokes, 0);
  const totalStrokes = frontStrokes + backStrokes;

  // Count birdies, pars, bogeys
  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0;
  for (const h of holes) {
    const diff = h.strokes - AUGUSTA_PAR[h.hole - 1];
    if (diff <= -2) eagles++;
    else if (diff === -1) birdies++;
    else if (diff === 0) pars++;
    else if (diff === 1) bogeys++;
    else doubles++;
  }

  function formatScore(s) {
    if (s === 0) return 'E';
    if (s > 0) return `+${s}`;
    return `${s}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md mx-auto bg-bg-card border border-augusta/12 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
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
        <div className="px-5 pt-5 pb-4">
          <h3 className="font-[Playfair_Display] text-lg text-text-primary">{golferName}</h3>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-text-secondary/50">
            {data.position && <span>{data.position}</span>}
            <span className={`font-mono font-medium ${
              data.score < 0 ? 'text-active-blue' : data.score > 0 ? 'text-mc-red/70' : ''
            }`}>
              {formatScore(data.score)}
            </span>
            {data.thru && <span>Thru {data.thru}</span>}
            {odds && <span className="text-gold-dim/50 font-mono">{odds.americanOdds}</span>}
          </div>
        </div>

        {/* Round tabs */}
        {rounds.length > 0 && (
          <div className="flex gap-0 px-5 border-b border-augusta/8">
            {rounds.map((r, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setActiveRound(i); }}
                className={`text-[10px] tracking-[0.1em] uppercase py-2 px-3 transition-all border-b-[1.5px] ${
                  activeRound === i
                    ? 'text-text-primary border-gold/60'
                    : 'text-text-secondary/25 border-transparent hover:text-text-secondary/50'
                }`}
              >
                R{r.round}
              </button>
            ))}
          </div>
        )}

        {/* Scorecard */}
        {holes.length > 0 ? (
          <div className="px-5 py-4">
            {/* Hole-by-hole grid */}
            <div className="space-y-0">
              {/* Front 9 */}
              <div className="mb-3">
                <div className="flex items-center mb-2">
                  <span className="text-[9px] text-text-secondary/25 tracking-[0.12em] uppercase">Front</span>
                  <span className="text-[10px] text-text-secondary/30 font-mono ml-auto">
                    {frontNine.length === 9 ? frontStrokes : ''}
                  </span>
                </div>
                <div className="grid grid-cols-9 gap-0.5">
                  {/* Hole numbers */}
                  {[1,2,3,4,5,6,7,8,9].map(h => (
                    <div key={h} className="text-center text-[8px] text-text-secondary/20 pb-0.5">{h}</div>
                  ))}
                  {/* Par */}
                  {AUGUSTA_PAR.slice(0, 9).map((p, i) => (
                    <div key={i} className="text-center text-[8px] text-text-secondary/15 pb-1">{p}</div>
                  ))}
                  {/* Scores */}
                  {[1,2,3,4,5,6,7,8,9].map(holeNum => {
                    const hole = holes.find(h => h.hole === holeNum);
                    const par = AUGUSTA_PAR[holeNum - 1];
                    if (!hole) return <div key={holeNum} className="text-center text-[11px] text-text-secondary/10">-</div>;
                    return (
                      <div key={holeNum}
                        className={`text-center text-[11px] font-mono font-medium rounded py-0.5 ${scoreColor(hole.strokes, par)}`}
                        title={`${HOLE_NAMES[holeNum - 1]} — ${scoreName(hole.strokes, par)}`}
                      >
                        {hole.strokes}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Back 9 */}
              <div>
                <div className="flex items-center mb-2">
                  <span className="text-[9px] text-text-secondary/25 tracking-[0.12em] uppercase">Back</span>
                  <span className="text-[10px] text-text-secondary/30 font-mono ml-auto">
                    {backNine.length === 9 ? backStrokes : ''}
                  </span>
                </div>
                <div className="grid grid-cols-9 gap-0.5">
                  {[10,11,12,13,14,15,16,17,18].map(h => (
                    <div key={h} className="text-center text-[8px] text-text-secondary/20 pb-0.5">{h}</div>
                  ))}
                  {AUGUSTA_PAR.slice(9).map((p, i) => (
                    <div key={i} className="text-center text-[8px] text-text-secondary/15 pb-1">{p}</div>
                  ))}
                  {[10,11,12,13,14,15,16,17,18].map(holeNum => {
                    const hole = holes.find(h => h.hole === holeNum);
                    const par = AUGUSTA_PAR[holeNum - 1];
                    if (!hole) return <div key={holeNum} className="text-center text-[11px] text-text-secondary/10">-</div>;
                    return (
                      <div key={holeNum}
                        className={`text-center text-[11px] font-mono font-medium rounded py-0.5 ${scoreColor(hole.strokes, par)}`}
                        title={`${HOLE_NAMES[holeNum - 1]} — ${scoreName(hole.strokes, par)}`}
                      >
                        {hole.strokes}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Round summary stats */}
            {holes.length > 0 && (
              <div className="mt-4 pt-3 border-t border-augusta/8 flex items-center justify-between text-[10px]">
                <div className="flex gap-3">
                  {eagles > 0 && (
                    <span className="text-active-blue">{eagles} {eagles === 1 ? 'eagle' : 'eagles'}</span>
                  )}
                  {birdies > 0 && (
                    <span className="text-active-blue/70">{birdies} {birdies === 1 ? 'birdie' : 'birdies'}</span>
                  )}
                  {bogeys > 0 && (
                    <span className="text-mc-red/60">{bogeys} {bogeys === 1 ? 'bogey' : 'bogeys'}</span>
                  )}
                  {doubles > 0 && (
                    <span className="text-mc-red/80">{doubles} double{doubles !== 1 ? 's' : ''}+</span>
                  )}
                </div>
                {holes.length === 18 && (
                  <span className="font-mono text-text-secondary/40">{totalStrokes}</span>
                )}
              </div>
            )}

            {/* Score legend */}
            <div className="mt-3 flex gap-2 justify-center text-[8px] text-text-secondary/20">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-active-blue/20" /> Eagle+</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-active-blue/8" /> Birdie</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-mc-red/8" /> Bogey</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-mc-red/15" /> Double+</span>
            </div>
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-text-secondary/30 text-[11px]">
            No hole data yet
          </div>
        )}

        {/* Bottom padding for mobile */}
        <div className="h-2" />
      </div>
    </div>
  );
}
