# Endure Masters Pool — Project Memory

## Live URL
https://masters-app-rosy.vercel.app

## GitHub
https://github.com/missrevthebot/MastersApp (public repo)

## Deployment — Vercel via deploy.sh

### How to deploy:
```bash
cd "/Users/openclaw/Desktop/Masters Pool 2026/masters-leaderboard"
bash deploy.sh
```
That's it. The script handles everything: build, delete old project, create fresh, deploy, set alias.

### LESSON LEARNED: Vercel repeat deploy bug
Vercel free tier fails on all deploys after the first one to a project ("Unexpected error"). The workaround in `deploy.sh` deletes and recreates the project each time. This works reliably. Do NOT try to fix this by reconnecting GitHub integration or using `vercel --prod` directly — it will fail. Always use `deploy.sh`.

### LESSON LEARNED: Vercel GitHub integration
The GitHub integration auto-connects on project creation but fails because GitHub account (`missrevthebot`) doesn't match Vercel account (`collinlamar-1087`). The deploy script disconnects it after each deploy.

---

## How to Add/Update Picks (Quick Guide)

All entries are hardcoded in **`src/hooks/useEntries.js`** so every viewer sees the same pool.

### Steps:
1. Open `src/hooks/useEntries.js` and edit the `DEFAULT_ENTRIES` array.

2. **To add a new entry**, paste a new line inside the array:
   ```js
   { id: 'e14', name: 'First Last', picks: ['Golfer 1', 'Golfer 2', 'Golfer 3', 'Golfer 4', 'Golfer 5', 'Golfer 6'] },
   ```
   - Increment the id — current max is `e13`
   - Use full golfer names exactly as ESPN lists them
   - Order of picks doesn't matter — best 4 are auto-selected

3. **Deploy**:
   ```bash
   cd "/Users/openclaw/Desktop/Masters Pool 2026/masters-leaderboard"
   git add -A && git commit -m "feat: update entries" && git push
   bash deploy.sh
   ```

### Important Notes
- **Golfer names must match ESPN** — fuzzy matching handles diacritics (Åberg, Højgaard, García)
- **6 picks per entry** — the scoring engine expects exactly 6
- **Admin panel** (gear icon, PIN `5445`) — local to that browser only

---

## Architecture
- **React + Vite + Tailwind CSS** — single page app, fully client-side
- **No backend** — all API calls from browser, data cached in localStorage
- **Vercel** — static deploy via `deploy.sh` script

## Data Sources

### ESPN Scores
- Endpoint: `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard`
- Polls every **60 seconds**, cached to localStorage

### The Odds API (Live Betting Odds)
- Key: `c38b243a9594e20d3a10f5a42481a489` (in `src/hooks/useOdds.js`)
- **500 requests/month** free tier
- Fetches **hourly, 7am-10pm CST only** (~64 req over tournament)
- US bookmakers: DraftKings, FanDuel, BetMGM, Caesars, PointsBet
- Fuzzy matching strips diacritics (NFD + manual ø→o, æ→ae, ð→d)

## Key Files
| File | Purpose |
|------|---------|
| `deploy.sh` | **Reliable Vercel deploy script** — always use this |
| `src/hooks/useEntries.js` | Hardcoded entries + admin CRUD |
| `src/hooks/useGolfData.js` | ESPN polling + localStorage cache |
| `src/hooks/useOdds.js` | Odds API + fuzzy name matching |
| `src/scoring.js` | Scoring engine + win probability model |
| `src/components/Leaderboard.jsx` | Pool standings view |
| `src/components/TournamentLeaderboard.jsx` | Full Masters field view |
| `src/components/Admin.jsx` | Admin panel (PIN: 5445) |

## Current Entries (13)
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
12. Raphael Dickie — Scheffler, Schauffele, Hovland, Conners, Im, W. Clark
13. Dan Jackson — McIlroy, Fleetwood, Kim, Spaun, Woodland, Li
