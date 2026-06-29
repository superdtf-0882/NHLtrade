// Seeds the local/remote KV store with real 2023-24 trade-deadline players.
//
// Data source: the official NHL API (api-web.nhle.com). Note this API does
// NOT expose a per-game powerplay-TOI field for skaters (verified against
// both the game-log and boxscore endpoints). Instead this prototype tracks a
// composite "showcase signal" built from powerPlayPoints, shots, and total
// TOI trends — see lib/trendEngine.js and docs/celigo-flows.md for details.
import { kv } from '../lib/kv.js';

const SEASON = '20232024';

// Players confirmed traded during the 2023-24 season, identified by NHL
// player ID. fromTeam/toTeam/tradeDate are derived programmatically below
// from each player's actual game log team-change boundary, not hardcoded,
// so they're guaranteed accurate.
const CANDIDATES = [
  { playerId: '8477496', playerName: 'Elias Lindholm' },
  { playerId: '8478396', playerName: 'Noah Hanifin' },
  { playerId: '8477404', playerName: 'Jake Guentzel' },
  { playerId: '8477497', playerName: 'Sean Monahan' },
  { playerId: '8479999', playerName: 'Casey Mittelstadt' },
  { playerId: '8475726', playerName: 'Tyler Toffoli' },
  { playerId: '8476441', playerName: 'Joel Edmundson' },
  { playerId: '8480336', playerName: 'Sean Walker' },
  { playerId: '8477407', playerName: 'Anthony Duclair' },
];

// A few current players to seed the live watchlist panel with (any active
// roster players work — these don't need a trade history).
const WATCHLIST_CANDIDATES = [
  { playerId: '8478483', playerName: 'Mitch Marner' },
  { playerId: '8479323', playerName: 'Adam Fox' },
  { playerId: '8480069', playerName: 'Cale Makar' },
];

function toSeconds(mmss) {
  if (!mmss) return 0;
  const [m, s] = mmss.split(':').map(Number);
  return m * 60 + s;
}

async function fetchGameLog(playerId, season) {
  const res = await fetch(`https://api-web.nhle.com/v1/player/${playerId}/game-log/${season}/2`);
  if (!res.ok) throw new Error(`Game log fetch failed for ${playerId}: ${res.status}`);
  const data = await res.json();
  return data.gameLog || [];
}

function findTradeBoundary(sortedGames) {
  let last = null;
  for (const g of sortedGames) {
    if (last && g.teamAbbrev !== last) {
      return { date: g.gameDate, fromTeam: last, toTeam: g.teamAbbrev };
    }
    last = g.teamAbbrev;
  }
  return null;
}

function toGameLogRecord(playerId, season, game) {
  return {
    playerId,
    gameDate: game.gameDate,
    season,
    teamAbbrev: game.teamAbbrev,
    toiSeconds: toSeconds(game.toi),
    ppPoints: game.powerPlayPoints ?? 0,
    shots: game.shots ?? 0,
    gameId: game.gameId,
  };
}

async function seedTradedPlayer(candidate) {
  const games = await fetchGameLog(candidate.playerId, SEASON);
  const sorted = [...games].sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  const boundary = findTradeBoundary(sorted);

  if (!boundary) {
    console.warn(`No trade boundary found for ${candidate.playerName}, skipping`);
    return false;
  }

  const player = {
    playerId: candidate.playerId,
    playerName: candidate.playerName,
    tradeDate: boundary.date,
    fromTeam: boundary.fromTeam,
    toTeam: boundary.toTeam,
    season: SEASON,
  };

  const gameLogs = sorted.map((g) => toGameLogRecord(candidate.playerId, SEASON, g));

  await kv.set(`player:${candidate.playerId}`, player);
  await kv.set(`gamelogs:${candidate.playerId}`, gameLogs);

  console.log(
    `Seeded ${candidate.playerName}: ${player.fromTeam} -> ${player.toTeam} on ${player.tradeDate} (${gameLogs.length} games)`
  );
  return true;
}

async function seedWatchlistPlayer(candidate) {
  const season = '20242025';
  let games;
  try {
    games = await fetchGameLog(candidate.playerId, season);
  } catch (err) {
    console.warn(`Skipping watchlist seed for ${candidate.playerName}: ${err.message}`);
    return false;
  }
  const sorted = [...games].sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  if (sorted.length === 0) {
    console.warn(`No games found for ${candidate.playerName} in ${season}, skipping`);
    return false;
  }

  const player = {
    playerId: candidate.playerId,
    playerName: candidate.playerName,
    fromTeam: sorted[sorted.length - 1].teamAbbrev,
    toTeam: null,
    tradeDate: null,
    season,
  };

  const gameLogs = sorted.map((g) => toGameLogRecord(candidate.playerId, season, g));

  await kv.set(`player:${candidate.playerId}`, player);
  await kv.set(`gamelogs:${candidate.playerId}`, gameLogs);
  console.log(`Seeded watchlist player ${candidate.playerName} (${gameLogs.length} games)`);
  return true;
}

async function main() {
  console.log('Seeding historical traded players...');
  const tradedResults = await Promise.all(CANDIDATES.map(seedTradedPlayer));
  const tradedCount = tradedResults.filter(Boolean).length;

  console.log('\nSeeding live watchlist players...');
  const watchlistResults = await Promise.all(WATCHLIST_CANDIDATES.map(seedWatchlistPlayer));
  const watchlistIds = WATCHLIST_CANDIDATES
    .filter((_, i) => watchlistResults[i])
    .map((c) => c.playerId);

  await kv.set('watchlist', watchlistIds);

  console.log(`\nDone. Seeded ${tradedCount} traded players, ${watchlistIds.length} watchlist players.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
