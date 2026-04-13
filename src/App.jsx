import { useState } from 'react';
import { useGolfData } from './hooks/useGolfData';
import { useEntries } from './hooks/useEntries';
import { useOdds } from './hooks/useOdds';
import { scoreAndRank, calcWinProbabilities } from './scoring';
import Header from './components/Header';
import Leaderboard from './components/Leaderboard';
import TournamentLeaderboard from './components/TournamentLeaderboard';
import GolferDetail from './components/GolferDetail';
import Admin from './components/Admin';

export default function App() {
  const { golferData, golferNames, tournamentInfo, lastUpdate, isLoading, error } = useGolfData();
  const { entries, addEntry, bulkImport, updateEntry, deleteEntry } = useEntries();
  const { oddsData } = useOdds();
  const [showAdmin, setShowAdmin] = useState(false);
  const [tab, setTab] = useState('pool');
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('masters-light-mode') === 'true');
  const [selectedGolfer, setSelectedGolfer] = useState(null);

  function toggleLight() {
    setLightMode(prev => {
      const next = !prev;
      localStorage.setItem('masters-light-mode', String(next));
      return next;
    });
  }

  const { scored, mcPenalty } = scoreAndRank(entries, golferData);
  const { winProbabilities, simDetails } = calcWinProbabilities(scored, oddsData, golferData) || {};

  return (
    <div className={`min-h-screen bg-bg ${lightMode ? 'light' : ''}`}>
      <Header
        tournamentInfo={tournamentInfo}
        lastUpdate={lastUpdate}
        isLoading={isLoading}
        error={error}
        onAdminClick={() => setShowAdmin(true)}
        lightMode={lightMode}
        onToggleLight={toggleLight}
      />

      {scored.length > 0 && scored[0].best4Total !== null && (
        <div className="max-w-lg mx-auto px-5 pt-4 text-center">
          <div className="bg-gold/10 border border-gold/20 rounded-xl px-4 py-3">
            <p className="text-[10px] text-text-secondary/40 tracking-[0.15em] uppercase">2026 Masters Complete</p>
            <p className="font-[Playfair_Display] text-gold text-lg mt-1">{scored[0].name}</p>
            <p className="text-[11px] text-text-secondary/50 font-mono mt-0.5">{scored[0].best4Total >= 0 ? '+' : ''}{scored[0].best4Total} · Winner Take All</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-lg mx-auto px-5 pt-3">
        <div className="flex gap-6 justify-center">
          {['pool', 'tournament'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[11px] tracking-[0.1em] uppercase py-2 transition-all border-b-[1.5px] ${
                tab === t
                  ? 'text-text-primary border-gold/60'
                  : 'text-text-secondary/30 border-transparent hover:text-text-secondary/60'
              }`}
            >
              {t === 'pool' ? 'Pool' : 'Tournament'}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 py-5">
        {tab === 'pool' && (
          <Leaderboard
            scoredEntries={scored}
            mcPenalty={mcPenalty}
            oddsData={oddsData}
            winProbabilities={winProbabilities}
            simDetails={simDetails}
            onGolferClick={setSelectedGolfer}
            golferData={golferData}
          />
        )}
        {tab === 'tournament' && (
          <TournamentLeaderboard
            golferData={golferData}
            oddsData={oddsData}
            entries={entries}
            onGolferClick={setSelectedGolfer}
          />
        )}
      </main>

      <footer className="max-w-lg mx-auto px-5 py-8 text-center">
        <div className="h-px bg-gradient-to-r from-transparent via-augusta/10 to-transparent mb-4" />
        <p className="text-[9px] text-text-secondary/20 tracking-[0.2em] uppercase">
          Pick 6 &middot; Best 4 &middot; Winner Take All
        </p>
      </footer>

      {/* Golfer detail sheet */}
      {selectedGolfer && (
        <GolferDetail
          golferName={selectedGolfer}
          golferData={golferData}
          oddsData={oddsData}
          onClose={() => setSelectedGolfer(null)}
        />
      )}

      {showAdmin && (
        <Admin
          entries={entries}
          golferNames={golferNames}
          onAdd={addEntry}
          onBulkImport={bulkImport}
          onUpdate={updateEntry}
          onDelete={deleteEntry}
          onClose={() => setShowAdmin(false)}
        />
      )}
    </div>
  );
}
