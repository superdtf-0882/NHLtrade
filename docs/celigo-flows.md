# Celigo Flow Specs — NHL Trade Showcase Signal

These flows are configured manually in Celigo (David). This document is the
spec for that configuration. Not live for the current demo — the prototype
is seeded directly via `scripts/seed.js`, which pulls the same source data
these flows would push.

## Important: deviation from the original brief

The original hypothesis targeted **powerplay time-on-ice (PP TOI)** as the
showcase signal. The public NHL API does **not** expose a per-game PP TOI
field for skaters — verified directly against both:

- `GET /v1/player/{playerId}/game-log/{season}/2` (per-game skater log)
- `GET /v1/gamecenter/{gameId}/boxscore` (per-game boxscore)

Neither returns `powerPlayTimeOnIce` or equivalent. Third-party sources that
do compute this (MoneyPuck, Natural Stat Trick) either require a paid data
license for programmatic access (MoneyPuck blocks bulk scraping without one)
or have no public API at all (Natural Stat Trick is scrape-only).

**Resolution:** the prototype instead computes a composite "showcase signal"
from three fields the NHL API does provide per game, validated against real
2023-24 trade-deadline players: `powerPlayPoints`, `shots`, and total `toi`.
See `lib/trendEngine.js` for the weighting and threshold. This is a real,
defensible proxy — increased PP point production is direct evidence of an
increased PP role, even without raw PP TOI.

## Flow A — Traded Player List

**Source:** PuckPedia trade search endpoint, or a manual CSV seed for the
prototype phase.

**Target:** Vercel KV via `POST /api/ingest-players`

**Payload (array or single object):**

```json
{
  "playerId": "string",
  "playerName": "string",
  "tradeDate": "YYYY-MM-DD",
  "fromTeam": "string",
  "toTeam": "string",
  "season": "YYYYYYYY"
}
```

All fields are required strings; the ingest route rejects records missing
any of them.

**Scope for prototype:** last 3 seasons (2022-23 through 2024-25), ~50
traded players max for demo manageability.

## Flow B — Game Log Ingestion

**Source:** NHL API, `GET https://api-web.nhle.com/v1/player/{playerId}/game-log/{season}/2`

**Trigger:** runs after Flow A completes (historical backfill), or on a
schedule for live-watchlist players.

**Transform (Celigo JavaScript hook):**

```javascript
function toSeconds(mmss) {
  if (!mmss) return 0;
  const [m, s] = mmss.split(':').map(Number);
  return (m * 60) + s;
}

// NHL API response field is `gameLog`, not `games`.
output = input.gameLog.map(game => ({
  playerId: input.playerId,
  gameDate: game.gameDate,
  season: input.season,
  teamAbbrev: game.teamAbbrev,
  toiSeconds: toSeconds(game.toi),
  ppPoints: game.powerPlayPoints ?? 0,
  shots: game.shots ?? 0,
  gameId: game.gameId,
}));
```

**Target:** Vercel KV via `POST /api/ingest-gamelogs`

**Dedup:** the ingest route merges incoming records into the existing
`gamelogs:{playerId}` array by `gameId`, so re-running the same season is
idempotent.

## KV Data Model

```
player:{playerId}              → { playerName, tradeDate, fromTeam, toTeam, season }
gamelogs:{playerId}            → [ { gameDate, season, teamAbbrev, toiSeconds, ppPoints, shots, gameId } ]
watchlist                      → [ playerId, ... ]
analysis:{playerId}            → { composite, flagged, metrics, computedAt, ... } (written by /api/analyze)
```

## Auth

Add Celigo's IP allowlist or a shared-secret header on the ingest routes
before going live — not implemented in the prototype.
