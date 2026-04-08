# Endure Masters Pool — Project Memory

## Live URL
https://missrevthebot.github.io/MastersApp/

## GitHub
https://github.com/missrevthebot/MastersApp (public repo)

## Deployment — GitHub Pages (NOT Vercel)
- **Hosting**: GitHub Pages, auto-deploys on push to `main` via GitHub Actions
- **Workflow**: `.github/workflows/deploy.yml` — builds with Vite, uploads artifact, deploys to Pages
- **Build**: Vite 6.4.2, Node 20, `base: '/MastersApp/'` in vite.config.js
- After pushing, GitHub Actions builds and deploys in ~60 seconds

### LESSON LEARNED: Do NOT use Vercel
Vercel free tier has a persistent bug where the first deploy to a new project succeeds, but all subsequent deploys fail with "Unexpected error. Please try again later." This happened across 3+ project recreations. The Vercel GitHub integration also fails because the GitHub account (`missrevthebot`) doesn't match the Vercel account (`collinlamar-1087`). **Always use GitHub Pages for this project.**

---

## How to Add/Update Picks (Quick Guide)

All entries are hardcoded in **`src/hooks/useEntries.js`** so every viewer sees the same pool.

### Steps:
1. Open terminal and navigate to the project:
   ```bash
   cd "/Users/openclaw/Desktop/Masters Pool 2026/masters-leaderboard"
   ```

2. Open `src/hooks/useEntries.js` and edit the `DEFAULT_ENTRIES` array.

3. **To add a new entry**, paste a new line inside the array:
   ```js
   { id: 'e13', name: 'First Last', picks: ['Golfer 1', 'Golfer 2', 'Golfer 3', 'Golfer 4', 'Golfer 5', 'Golfer 6'] },
   ```
   - Increment the id (`e13`, `e14`, etc.) — current max is `e12`
   - Use full golfer names exactly as ESPN lists them (e.g. `'Jon Rahm'`, not `'Rahm'`)
   - Order of picks doesn't matter — best 4 are auto-selected

4. **To edit an existing entry**, find their line and change the name or picks array.

5. **To remove an entry**, delete their line from the array.

6. **Deploy the changes** (one command):
   ```bash
   cd "/Users/openclaw/Desktop/Masters Pool 2026/masters-leaderboard"
   git add src/hooks/useEntries.js && git commit -m "feat: update entries" && git push
   ```
   GitHub Pages auto-deploys in ~60 seconds. Everyone sees the update immediately.

### Important Notes
- **Golfer names must match ESPN** — the app uses fuzzy matching with diacritics stripping (Åberg → Aberg, García → Garcia) but exact names are best
- **6 picks per entry** — the scoring engine expects exactly 6
- **Admin panel** (gear icon, PIN `5445`) can add entries too, but those are local to that browser only. Hardcoded entries are the source of truth.

---

## Architecture
- **React + Vite + Tailwind CSS** — single page app, fully client-side
- **No backend** — all API calls from browser, data cached in localStorage
- **GitHub Pages** — static deploy via GitHub Actions on push to `main`

## Data Sources

### ESPN Scores
- Endpoint: `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard`
- Polls every **60 seconds**
- Cached to localStorage so scores persist after tournament ends
- No API key needed

### The Odds API (Live Betting Odds)
- Key: `c38b243a9594e20d3a10f5a42481a489` (in `src/hooks/useOdds.js`)
- **500 requests/month** free tier
- Fetches **hourly, 7am-10pm CST only** (~64 requests over tournament weekend)
- US bookmakers: DraftKings, FanDuel, BetMGM, Caesars, PointsBet
- Fuzzy name matching with diacritics stripping (normalize NFD) so Nordic/Spanish names match
- Cached to localStorage between fetches

## Scoring Rules
- Pick 6 golfers, use best 4 scores (lowest total to-par wins)
- **MC penalty** = worst made-cut score + 1 (dynamic)
- Tiebreaker: 5th-best golfer, then 6th, then split
- Tied golfer scores: better odds kept in best 4

## Admin Panel
- Tap **gear icon** (top-right of header)
- PIN: `5445`
- Easter egg: entering `1234` shows a message for Pat
- Can upload `.xlsx` or manually add/edit/delete entries
- Admin changes are **local to that browser only**

## Key Files
| File | Purpose |
|------|---------|
| `src/hooks/useEntries.js` | **Hardcoded entries** + admin CRUD |
| `src/hooks/useGolfData.js` | ESPN polling + localStorage cache |
| `src/hooks/useOdds.js` | Odds API + fuzzy matching with diacritics |
| `src/scoring.js` | Scoring engine + win probability model |
| `src/components/Leaderboard.jsx` | Pool standings view |
| `src/components/TournamentLeaderboard.jsx` | Full Masters field view |
| `src/components/Admin.jsx` | Admin panel |
| `src/components/Header.jsx` | Header with live status + light/dark toggle |
| `src/index.css` | Theme colors (Augusta green/gold) + light mode |
| `.github/workflows/deploy.yml` | GitHub Pages deploy workflow |
| `vite.config.js` | Vite config with `base: '/MastersApp/'` for GH Pages |

## Current Entries (12)
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
