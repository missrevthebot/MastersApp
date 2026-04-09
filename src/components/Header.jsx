export default function Header({ tournamentInfo, lastUpdate, isLoading, error, onAdminClick, lightMode, onToggleLight }) {
  const timeStr = lastUpdate
    ? lastUpdate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '--';

  const isLive = tournamentInfo.status === 'in' ||
    tournamentInfo.round?.toLowerCase().includes('round') ||
    tournamentInfo.status?.toLowerCase().includes('progress');

  return (
    <header className="relative">
      {/* Thin gold rule */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-gold/60 to-transparent" />

      <div className="max-w-lg mx-auto px-5 pt-6 pb-4">
        {/* Title block */}
        <div className="text-center">
          <h1 className="font-[Playfair_Display] text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
            Endure Masters Pool
          </h1>
          <p className="text-text-secondary/60 text-[11px] mt-1 tracking-[0.2em] uppercase">
            Augusta National &middot; 2026
          </p>
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between mt-4 text-[11px] text-text-secondary/60">
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-active-blue"
                      style={{ animation: 'livePulse 2s ease-in-out infinite' }} />
                <span className="text-active-blue font-medium tracking-wider uppercase text-[10px]">Live</span>
              </span>
            )}
            {tournamentInfo.round && (
              <span>{tournamentInfo.round}</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {error && (
              <span className="text-mc-red/70 text-[10px]">offline</span>
            )}
            <span>
              {timeStr}
            </span>
            {isLoading && (
              <span className="w-2.5 h-2.5 border border-text-secondary/30 border-t-text-secondary rounded-full animate-spin" />
            )}
          </div>
        </div>
      </div>

      {/* Subtle divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-augusta/15 to-transparent" />

      {/* Top-right controls — minimal */}
      <div className="absolute top-2.5 right-3 flex items-center gap-1.5">
        <button
          onClick={onToggleLight}
          className="text-text-secondary/25 hover:text-text-secondary/60 transition-colors text-xs p-1"
          aria-label="Toggle light mode"
        >
          {lightMode ? '🌙' : '☀️'}
        </button>
        <button
          onClick={onAdminClick}
          className="text-text-secondary/20 hover:text-text-secondary/50 transition-colors text-sm p-1"
          aria-label="Admin"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
