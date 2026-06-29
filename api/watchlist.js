import { kv } from '../lib/kv.js';
import { evaluateCurrentTrend } from '../lib/trendEngine.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const watchlist = (await kv.get('watchlist')) || [];

  const results = await Promise.all(
    watchlist.map(async (playerId) => {
      const player = await kv.get(`player:${playerId}`);
      const gameLogs = (await kv.get(`gamelogs:${playerId}`)) || [];
      const trend = evaluateCurrentTrend(gameLogs);

      return {
        playerId,
        playerName: player?.playerName ?? playerId,
        team: player?.fromTeam ?? player?.toTeam ?? null,
        ...trend,
      };
    })
  );

  return res.status(200).json({
    updatedAt: new Date().toISOString(),
    players: results,
  });
}
