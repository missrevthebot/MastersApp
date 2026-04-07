# 2026 Masters Pool Leaderboard

Live auto-updating leaderboard for a Masters pool. Pick 6, Use Best 4.

## Deploy to Vercel

```bash
# Option 1: Vercel CLI
npm i -g vercel
cd masters-leaderboard
vercel

# Option 2: Push to GitHub and connect repo in vercel.com
```

That's it. Vercel auto-detects Vite and builds.

## How it works

- Pulls live scores from ESPN golf API every 60 seconds
- Each entry has 6 golfer picks, best 4 scores count
- MC penalty = worst made-cut score + 1 (so MC always loses to making the cut)
- Entries stored in browser localStorage (no backend needed)

## Admin Panel

- Tap the invisible button in the bottom-right corner of the header
- Default PIN: `1234`
- To change the PIN, edit `ADMIN_PIN` in `src/components/Admin.jsx` line 3
- Add/edit/delete entries with autocomplete from live ESPN golfer names

## Share

After deploying, share the Vercel URL with your pool. Everyone sees the live leaderboard.
Only you (with the PIN) can add/edit entries.

## Dev

```bash
npm install
npm run dev
```
