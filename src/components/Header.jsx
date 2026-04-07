export default function Header({ tournamentInfo, lastUpdate, isLoading, error, onAdminClick, lightMode, onToggleLight }) {
  const timeStr = lastUpdate
    ? lastUpdate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '--';

  const isLive = tournamentInfo.status === 'in' ||
    tournamentInfo.round?.toLowerCase().includes('round') ||
    tournamentInfo.status?.toLowerCase().includes('progress');

  return (
    <header className="relative border-b border-augusta/30">
      {/* Gold accent line */}
      <div className="h-1 bg-gradient-to-r from-augusta via-gold to-augusta" />

      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
        {/* Title */}
        <div className="text-center">
          <h1 className="font-[Playfair_Display] text-3xl sm:text-4xl font-bold text-gold tracking-wide">
            Endure Masters Pool
          </h1>
          <p className="text-text-secondary text-sm mt-1 font-[Playfair_Display] italic">
            Augusta National Golf Club — 2026
          </p>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between mt-3 text-xs text-text-secondary">
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400" style={{ animation: 'livePulse 2s ease-in-out infinite' }} />
                <span className="text-green-400 font-medium uppercase tracking-wider">Live</span>
              </span>
            )}
            {tournamentInfo.round && (
              <span className="text-text-secondary">{tournamentInfo.round}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {error && (
              <span className="text-mc-red text-[10px]">API error</span>
            )}
            <span className="opacity-70">
              Updated {timeStr}
            </span>
            {isLoading && (
              <span className="w-3 h-3 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
            )}
          </div>
        </div>
      </div>

      {/* Top-right controls */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <button
          onClick={onToggleLight}
          className="text-text-secondary/40 hover:text-gold/70 transition-colors text-sm"
          aria-label="Toggle light mode"
          title={lightMode ? 'Dark mode' : 'Light mode'}
        >
          {lightMode ? '🌙' : '☀️'}
        </button>
        <button
          onClick={onAdminClick}
          className="text-text-secondary/30 hover:text-gold/70 transition-colors text-lg"
          aria-label="Admin"
          title="Admin"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
