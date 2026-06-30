# Celigo Flow Specs — NHL Trade Showcase Signal

These flows are configured manually in Celigo (David). This document is the
spec for that configuration. Flows A and B are seeded directly via
`scripts/seed.js` for the prototype; Flows C and D represent the live
PuckPedia round-trip that demonstrates end-to-end Celigo orchestration.

---

## Important: deviation from the original brief

The original hypothesis targeted **powerplay time-on-ice (PP TOI)** as the
showcase signal. The public NHL API does **not** expose a per-game PP TOI
field for skaters — verified directly against both:

- `GET /v1/player/{playerId}/game-log/{season}/2` (per-game skater log)
- `GET /v1/gamecenter/{gameId}/boxscore` (per-game boxscore)

Neither returns `powerPlayTimeOnIce` or equivalent. Third-party sources that
do compute this (MoneyPuck, Natural Stat Trick) either require a paid data
license for programmatic access or have no public API.

**Resolution:** the prototype computes a composite "showcase signal" from
three fields the NHL API does provide per game: `powerPlayPoints` (50%),
`shots` (25%), and total `toi` (25%). Validated against real 2023-24
trade-deadline players — 5 of 9 flag at composite > 30. See
`lib/trendEngine.js` for weighting details.

---

## Flow A — Traded Player List

**Source:** PuckPedia trade search endpoint (API key required — pending).

**Target:** `POST /api/ingest-players`

**Payload:**
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

**Assumed PuckPedia fields to map in Celigo transform:**
```javascript
output = {
  playerId:   String(input.nhl_id),
  playerName: input.player_name,
  tradeDate:  input.trade_date,        // confirm format is YYYY-MM-DD
  fromTeam:   input.from_team_abbrev,
  toTeam:     input.to_team_abbrev,
  season:     input.season_id,
};
```
Field names are assumptions — update once PuckPedia API key is received.

---

## Flow B — Game Log Ingestion

**Source:** NHL API, `GET https://api-web.nhle.com/v1/player/{playerId}/game-log/{season}/2`

**Trigger:** runs after Flow A completes (historical backfill), or nightly
schedule for live-watchlist players.

**Celigo JavaScript transform:**
```javascript
function toSeconds(mmss) {
  if (!mmss) return 0;
  const [m, s] = mmss.split(':').map(Number);
  return (m * 60) + s;
}

// NHL API response field is `gameLog`, not `games`.
output = input.gameLog.map(game => ({
  playerId:   input.playerId,
  gameDate:   game.gameDate,
  season:     input.season,
  teamAbbrev: game.teamAbbrev,
  toiSeconds: toSeconds(game.toi),
  ppPoints:   game.powerPlayPoints ?? 0,
  shots:      game.shots ?? 0,
  gameId:     game.gameId,
}));
```

**Target:** `POST /api/ingest-gamelogs`

**Dedup:** ingest route merges by `gameId` — re-running the same season is
idempotent.

---

## Flow C — IR / Transaction Data  ← live Celigo demo flow

**Source:** PuckPedia player transactions endpoint (same API key as Flow A).

**Target:** `POST /api/ingest-transactions`

**Payload:**
```json
{
  "playerId": "string",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "type": "IR_PLACED | IR_RETURNED | LTIR_PLACED | LTIR_RETURNED",
      "notes": "optional string"
    }
  ]
}
```

**Assumed PuckPedia fields to map:**
```javascript
output = {
  playerId: String(input.nhl_id),
  transactions: input.transactions.map(t => ({
    date:  t.transaction_date,   // confirm format
    type:  mapType(t.type),      // see mapping below
    notes: t.description ?? '',
  })),
};

function mapType(raw) {
  const map = {
    'placed_on_ir':        'IR_PLACED',
    'activated_from_ir':   'IR_RETURNED',
    'placed_on_ltir':      'LTIR_PLACED',
    'activated_from_ltir': 'LTIR_RETURNED',
  };
  return map[raw] ?? raw;
}
```

**Effect on signal:** if a player returned from IR within 30 days of the
window end, the composite flag is suppressed — recovery, not showcase.
The dashboard shows an ⚠️ IR return badge instead of a trade flag.

---

## Flow D — Contract Data  ← live Celigo demo flow

**Source:** PuckPedia player contract endpoint (same API key as Flow A).

**Target:** `POST /api/ingest-contracts`

**Payload:**
```json
{
  "playerId": "string",
  "playerName": "string",
  "contractExpiryYear": 2026,
  "contractType": "UFA | RFA | ELC",
  "capHit": 8000000
}
```

**Assumed PuckPedia fields to map:**
```javascript
output = {
  playerId:            String(input.nhl_id),
  playerName:          input.player_name,
  contractExpiryYear:  input.expiry_year,         // integer
  contractType:        input.expiry_status,        // "UFA", "RFA", or "ELC"
  capHit:              input.cap_hit ?? null,
};
```

**Effect on signal:** watchlist players whose contract expires this season
are flagged with a ★ and a contract tag (e.g. "UFA 2026") in the watchlist
table — additional context that the player has structural trade motivation
beyond the statistical signal.

---

## KV Data Model

All keys are namespaced `nhltrade:` in the shared Redis instance.

```
nhltrade:player:{playerId}         → { playerName, tradeDate, fromTeam, toTeam, season }
nhltrade:gamelogs:{playerId}       → [ { gameDate, season, teamAbbrev, toiSeconds, ppPoints, shots, gameId } ]
nhltrade:transactions:{playerId}   → [ { date, type, notes } ]
nhltrade:contract:{playerId}       → { playerName, contractExpiryYear, contractType, capHit }
nhltrade:watchlist                 → [ playerId, ... ]
nhltrade:analysis:{playerId}       → { composite, flagged, irSuppressed, irReturnDate, metrics, computedAt }
```

---

## Auth

Add Celigo's IP allowlist or a shared-secret request header on all ingest
routes before going live — not implemented in the prototype. Suggested header:
`X-Celigo-Secret: <token>` validated at the top of each handler.
