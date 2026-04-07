# Endure Masters Pool — Project Memory

## Live URL
https://masters-leaderboard-two.vercel.app

## GitHub
https://github.com/missrevthebot/MastersApp.git

## How to Add New Entries
Entries are hardcoded in `src/hooks/useEntries.js` in the `DEFAULT_ENTRIES` array.

1. Open `src/hooks/useEntries.js`
2. Add a new object to `DEFAULT_ENTRIES`:
   ```js
   { id: 'e12', name: 'New Person', picks: ['Tier1 Pick', 'Tier2 Pick', 'Tier3 Pick', 'Tier4 Pick', 'Tier5 Pick', 'Tier6 Pick'] },
   ```
3. Increment the id (`e12`, `e13`, etc.)
4. Push to GitHub — Vercel auto-deploys in ~30 seconds:
   ```bash
   cd "/Users/openclaw/Desktop/Masters Pool 2026/masters-leaderboard"
   git add -A && git commit -m "feat: add new entry" && git push
   ```

**Why hardcoded?** No backend/database. Hardcoded entries are baked into the build so every viewer sees the same pool. Admin panel still works for local-only additions per browser.

## Architecture
- **React + Vite + Tailwind** — single page app, fully client-side
- **No backend** — all API calls from browser, data in localStorage + hardcoded defaults
- **Vercel** — static deploy, auto-deploys on push to `main`

## Data Sources

### ESPN Scores
- Endpoint: `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard`
- Polls every **60 seconds**
- Cached to localStorage so scores persist after tournament ends (through Monday+)
- No API key needed

### The Odds API (Live Betting Odds)
- Key: `c38b243a9594e20d3a10f5a42481a489` (hardcoded in `src/hooks/useOdds.js`)
- **500 requests/month** free tier
- Fetches **hourly, 7am–10pm CST only** (~64 requests over tournament)
- US bookmakers only: DraftKings, FanDuel, BetMGM, Caesars, PointsBet
- American odds format
- Cached to localStorage between fetches

## Scoring Rules
- Pick 6 golfers (one per tier), use best 4 scores
- Score = sum of best 4 golfers' to-par scores (lowest wins)
- **MC penalty** = worst made-cut score + 1 (dynamic, so MC always loses to making the cut)
- Tiebreaker: 5th-best golfer, then 6th, then split
- When golfers are tied on score, the one with better odds is kept in best 4

## Key Files
| File | What it does |
|------|-------------|
| `src/hooks/useEntries.js` | Hardcoded entries + admin CRUD |
| `src/hooks/useGolfData.js` | ESPN polling + localStorage cache |
| `src/hooks/useOdds.js` | Odds API with smart hourly scheduling |
| `src/scoring.js` | Scoring engine + win probability model |
| `src/components/Leaderboard.jsx` | Pool standings view |
| `src/components/TournamentLeaderboard.jsx` | Full Masters field view |
| `src/components/Admin.jsx` | Admin panel (PIN: 1234) |
| `src/components/Header.jsx` | Header with live status |

## Admin Panel
- Tap the **gear icon** top-right of header
- PIN: `1234` (change in `src/components/Admin.jsx` line 3)
- Can upload `.xlsx` in Book2 format (Name | Tier1 | Tier2 | ... | Tier6)
- Can manually add/edit/delete entries
- Admin changes are **local to that browser only**

## Win Probability Model
- Converts outright winner odds → expected finish score using `−4 × ln(winProb / median)`
- Blends odds projection with current live score (60/40 current/odds)
- Takes best 4 projected scores per entry
- Uses softmax to compute relative win % across all entries
- Updates as odds and scores move

## Tier Structure (2026)
| Tier | Range | Count |
|------|-------|-------|
| 1 | up to 11/1 | 4 |
| 2 | 15/1–39/1 | 10 |
| 3 | 40/1–70/1 | 16 |
| 4 | 72/1–105/1 | 10 |
| 5 | 110/1–165/1 | 10 |
| 6 | 170/1+ | 32 |

## Current Entries (11)
1. Collin Lamar — Rahm, Aberg, Reed, Spaun, Woodland, Greyserman
2. Bob Bennett — Rahm, Rose, Reed, Spaun, Woodland, N. Taylor
3. Clark Foy 1 — McIlroy, Aberg, MacIntyre, McNealy, Woodland, W. Clark
4. Clark Foy 2 — DeChambeau, Schauffele, Gotterup, Spaun, Bradley, N. Taylor
5. Jesse Bennett — Rahm, Matsuyama, Kim, Kitayama, Im, Li
6. Trent Brink — McIlroy, Fleetwood, Straka, Spaun, Berger, B. Watson
7. Cole Hon — Scheffler, C. Young, Reed, Burns, Woodland, Gerard
8. Chris Ondo — DeChambeau, Koepka, MacIntyre, Conners, Griffin, Harman
9. Xander Cribb — Scheffler, Schauffele, Kim, Burns, Bradley, B. Watson
10. Justin Eeg — Rahm, Aberg, M.W. Lee, Spaun, Griffin, Harman
11. Patrick Crimi — Scheffler, Fitzpatrick, Henley, McNealy, Hall, N. Taylor
