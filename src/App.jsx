import { useState } from 'react';
import { useGolfData } from './hooks/useGolfData';
import { useEntries } from './hooks/useEntries';
import { useOdds } from './hooks/useOdds';
import { scoreAndRank, calcWinProbabilities } from './scoring';
import Header from './components/Header';
import Leaderboard from './components/Leaderboard';
import TournamentLeaderboard from './components/TournamentLeaderboard';
import Admin from './components/Admin';

export default function App() {
  const { golferData, golferNames, tournamentInfo, lastUpdate, isLoading, error } = useGolfData();
  const { entries, addEntry, bulkImport, updateEntry, deleteEntry } = useEntries();
  const { oddsData } = useOdds();
  const [showAdmin, setShowAdmin] = useState(false);
  const [tab, setTab] = useState('pool'); // 'pool' | 'tournament'

  const { scored, mcPenalty } = scoreAndRank(entries, golferData);
  const winProbabilities = calcWinProbabilities(scored, oddsData);

  return (
    <div className="min-h-screen bg-bg">
      <Header
        tournamentInfo={tournamentInfo}
        lastUpdate={lastUpdate}
        isLoading={isLoading}
        error={error}
        onAdminClick={() => setShowAdmin(true)}
      />

      {/* Tab navigation */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 pt-3">
        <div className="flex border-b border-augusta/20">
          <button
            onClick={() => setTab('pool')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              tab === 'pool'
                ? 'text-gold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Pool Standings
            {tab === 'pool' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold rounded-full" />
            )}
          </button>
          <button
            onClick={() => setTab('tournament')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              tab === 'tournament'
                ? 'text-gold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Tournament
            {tab === 'tournament' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold rounded-full" />
            )}
          </button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4">
        {tab === 'pool' && (
          <Leaderboard
            scoredEntries={scored}
            mcPenalty={mcPenalty}
            oddsData={oddsData}
            winProbabilities={winProbabilities}
          />
        )}
        {tab === 'tournament' && (
          <TournamentLeaderboard
            golferData={golferData}
            oddsData={oddsData}
            entries={entries}
          />
        )}
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-6 text-center">
        <div className="h-px bg-gradient-to-r from-transparent via-augusta/30 to-transparent mb-4" />
        <p className="text-[10px] text-text-secondary/50 tracking-wider uppercase">
          Pick 6 · Use Best 4 · Winner Take All
        </p>
      </footer>

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
