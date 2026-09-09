# NFL Matchup Board

Ranks skill-position players by how much their Week-N opponent changes their
chance of a big game. Built on one public nflverse CSV. No API keys.

## Deploy

```
matchup-board/
  index.html        # the app
  api/proxy.js      # allowlisted read-only proxy (ESPN schedule)
  api/stats.js      # fetches + trims the nflverse stats CSV
  README.md
```

Drop into a new repo and import it in Vercel, or add the three files to an
existing project — `index.html` under `public/`, the routes under `api/`.
No build step, no dependencies, no environment variables.

## Why the API routes exist

The browser cannot fetch GitHub release assets or ESPN cross-origin. Both
routes run server-side, where that restriction does not apply, so auto-fetch
works instead of falling back to a manual download.

`api/stats.js` also drops ~137 of the CSV's ~150 columns before sending it,
and caches the result at the edge for 6 hours. The upstream file only changes
once a week, so nearly every load is a cache hit.

## Failure behaviour

The app tries the server route, then a direct call, then asks for a manual
upload. It validates every required column on load and shows a green or red
chip per field. If a required column is missing it refuses to compute rather
than guessing — a board built from a misparsed column is worse than no board.

`api/stats.js` returns HTTP 500 with `{error:"schema changed", missing:[...]}`
if nflverse renames something. Fix by adding the new name to the `KEEP` alias
lists at the top of the file.

## Security

`api/proxy.js` allowlists five hosts and matches them exactly or as a
subdomain, so `evil-github.com` is rejected. Do not loosen this to a bare
`includes` check — an open proxy on your domain will get found and abused.
It is read-only: it forwards no headers, cookies, or request bodies.

## Known limits

- Defensive splits are raw yards allowed per target, not schedule-adjusted.
  Damping defaults to 0.5 to compensate. Raise it if you plug in adjusted data.
- Early season, prior-year data describes rosters that have changed. The
  lookback filter exists to drop stale weeks once enough current data exists.
- A strong matchup is a candidate, not a bet. Pricing is a separate question.
